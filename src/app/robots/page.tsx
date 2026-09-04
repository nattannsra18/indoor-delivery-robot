"use client";

import PageHeader from "@/components/PageHeader";
import WorkflowControls from "@/components/WorkflowControls";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import EmergencyStopControl from "@/components/EmergencyStopControl";
import { useLocale } from "@/context/LocaleContext";
import { robotText } from "@/lib/i18n";

export default function RobotStatusPage() {
  const { locale, t } = useLocale();
  const copy = robotText[locale];
  const {
    robot,
    activeTask,
    backendOnline
  } = useDeliveryApi();

  const robotConnected =
    backendOnline && robot.online;

  return (
    <>
      <PageHeader
        title={copy.title} description={copy.description}
      />

      <div className="mb-6"><EmergencyStopControl /></div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">
                {copy.robotId}
              </p>
              <h2 className="text-xl font-bold text-slate-900">
                {robot.name}
              </h2>
            </div>

            <span
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
                robotConnected
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              ● {robotConnected ? copy.online : copy.offline}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Info
              label={copy.state} value={robot.state === "IDLE" ? "IDLE" : robot.state.replaceAll("_", " ")}
            />
            <Info
              label={copy.battery}
              value={`${robot.battery}%`}
            />
            <Info
              label={copy.positionX}
              value={`${robot.x.toFixed(2)} m`}
            />
            <Info
              label={copy.positionY}
              value={`${robot.y.toFixed(2)} m`}
            />
            <Info
              label={copy.yaw}
              value={`${robot.yaw.toFixed(2)} rad`}
            />
            <Info
              label={copy.activeTask} value={activeTask?.id ?? copy.none}
            />
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <h2 className="font-semibold text-slate-900">
            {copy.integration}
          </h2>

          <div className="mt-5 space-y-3">
            <Health
              name="Next.js → FastAPI"
              state={
                backendOnline
                  ? copy.connected : copy.offline
              }
              warning={!backendOnline}
            />
            <Health
              name="PostgreSQL Storage"
              state={
                backendOnline
                  ? copy.available : copy.unavailable
              }
              warning={!backendOnline}
            />
            <Health
              name="ROS 2 Web Bridge"
              state={
                robotConnected
                  ? copy.connected : copy.offline
              }
              warning={!robotConnected}
            />
            <Health
              name="AMCL Telemetry"
              state={
                robotConnected
                  ? copy.streaming : copy.waiting
              }
              warning={!robotConnected}
            />
            <Health
              name="Nav2 Mission"
              state={
                activeTask
                  ? t("taskStatus")[activeTask.status]
                  : "IDLE"
              }
            />
          </div>
        </section>
      </div>

      <div className="mt-6">
        <WorkflowControls />
      </div>

      <section className="mt-6 rounded-2xl border border-blue-100 bg-blue-50 p-5">
        <h2 className="font-semibold text-blue-900">
          {copy.operatorConfirmation}
        </h2>
        <p className="mt-1 text-sm leading-6 text-blue-800">
          {copy.operatorHelp}
        </p>
      </section>
    </>
  );
}

function Info({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function Health({
  name,
  state,
  warning = false
}: {
  name: string;
  state: string;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 p-3">
      <span className="text-sm font-medium text-slate-700">
        {name}
      </span>
      <span
        className={`text-xs font-semibold ${
          warning
            ? "text-amber-700"
            : "text-emerald-700"
        }`}
      >
        ● {state}
      </span>
    </div>
  );
}
