"use client";

import DiagnosticsCards from "@/components/DiagnosticsCards";
import PageHeader from "@/components/PageHeader";
import RobotReadinessNotice from "@/components/RobotReadinessNotice";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText } from "@/lib/i18n";

export default function DiagnosticsPage() {
  const { backendOnline, diagnostics, fleet, robot, selectedRobotId } = useDeliveryApi();
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const robotConnected = backendOnline && robot.online;
  const selectedFleetRobot = fleet.find((item) => item.id === selectedRobotId)
    ?? fleet.find((item) => item.id === robot.id);
  const localizationDiagnostic = diagnostics?.statuses.find(
    (item) => item.name === "AMR/Localization"
  );
  const nav2Diagnostic = diagnostics?.statuses.find((item) => {
    const name = item.name.toLowerCase();
    return name.includes("lifecycle_manager_navigation")
      || name.includes("nav2 health");
  });

  return <>
    <PageHeader
      title={copy.diagnosticsDetails}
      description={locale === "th" ? `สถานะ ROS 2 และเซ็นเซอร์แบบเรียลไทม์สำหรับ ${robot.name}` : `Live ROS 2 and sensor health for ${robot.name}`}
    />

    {selectedFleetRobot && selectedFleetRobot.readinessStatus !== "READY" && (
      <div className="mt-6">
        <RobotReadinessNotice robot={selectedFleetRobot} />
      </div>
    )}

    <section id="system-connections" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">
          {copy.integrationHealth}
        </p>
        <h2 className="mt-1 text-lg font-bold text-slate-950">
          {locale === "th" ? "การเชื่อมต่อระบบ" : "System connections"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {copy.integrationDetailsHelp}
        </p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <ConnectionCard
          name="Next.js → FastAPI"
          state={backendOnline ? copy.online : copy.offline}
          active={backendOnline}
        />
        <ConnectionCard
          name="PostgreSQL"
          state={backendOnline ? copy.apiDatabaseReachable : copy.batteryUnavailable}
          active={backendOnline}
        />
        <ConnectionCard
          name="ROS 2 Web Bridge"
          state={robotConnected ? copy.online : copy.offline}
          active={robotConnected}
        />
        <ConnectionCard
          name={copy.poseTelemetry}
          state={localizationDiagnostic?.message ?? (locale === "th" ? "กำลังรอ" : "Waiting")}
          active={localizationDiagnostic?.level === "OK"}
        />
        <ConnectionCard
          name="Nav2"
          state={nav2Diagnostic?.message ?? copy.missionStandby}
          active={nav2Diagnostic ? nav2Diagnostic.level === "OK" : robotConnected}
        />
      </div>
    </section>

    <div className="mt-6">
      <DiagnosticsCards diagnostics={diagnostics} />
    </div>
  </>;
}

function ConnectionCard({
  name,
  state,
  active
}: {
  name: string;
  state: string;
  active: boolean;
}) {
  return (
    <article className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900">{name}</h3>
        <p className="mt-1 truncate text-xs text-slate-500" title={state}>{state}</p>
      </div>
      <span
        aria-label={active ? "connected" : "unavailable"}
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? "bg-emerald-500" : "bg-amber-500"}`}
      />
    </article>
  );
}
