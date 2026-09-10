"use client";

import { useMemo } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText, robotStateLabel } from "@/lib/i18n";
import type { FleetUnavailableReason } from "@/types";

export default function FleetOverview() {
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const { fleet, selectedRobotId, selectRobot, loading } = useDeliveryApi();

  const selected = fleet.find((robot) => robot.id === selectedRobotId) ?? fleet[0];
  const summary = useMemo(() => ({
    connected: fleet.filter((robot) => robot.online).length,
    active: fleet.filter((robot) => Boolean(robot.currentTaskId)).length,
    attention: fleet.filter((robot) => !robot.acceptsDeliveries).length,
  }), [fleet]);

  return <section aria-labelledby="fleet-overview-title" className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4 md:px-6">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{copy.fleetOperations}</p>
        <h2 id="fleet-overview-title" className="mt-1 text-lg font-bold text-slate-950">{copy.fleetOverview}</h2>
        <p className="mt-1 text-sm text-slate-500">{copy.fleetOverviewHelp}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Summary value={fleet.length} label={copy.fleetTotal} />
        <Summary value={summary.connected} label={copy.fleetConnected} tone="emerald" />
        <Summary value={summary.active} label={copy.fleetActive} tone="blue" />
        <Summary value={summary.attention} label={copy.fleetAttention} tone={summary.attention ? "amber" : "slate"} />
      </div>
    </div>

    {loading && fleet.length === 0 ? <p className="p-6 text-sm text-slate-500">{copy.fleetLoading}</p> : null}
    {!loading && fleet.length === 0 ? <p className="p-6 text-sm text-slate-500">{copy.fleetEmpty}</p> : null}

    {fleet.length > 0 ? <div className="grid gap-5 p-5 md:p-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,.65fr)]">
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
        {fleet.map((robot) => {
          const active = robot.id === selected?.id;
          return <button
            key={robot.id}
            type="button"
            aria-pressed={active}
            onClick={() => selectRobot(robot.id)}
            className={`rounded-2xl border p-4 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? "border-blue-400 bg-blue-50/70" : "border-slate-200 hover:border-blue-200 hover:bg-slate-50"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="truncate font-bold text-slate-950">{robot.name}</p><p className="mt-0.5 truncate font-mono text-xs text-slate-400">{robot.id}</p></div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${robot.online ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{robot.online ? copy.online : copy.offline}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <FleetMetric label={copy.fleetReadiness} value={robot.readinessStatus === "READY" ? copy.ready : robot.readinessStatus === "DEGRADED" ? copy.fleetDegraded : copy.fleetNotReady} />
              <FleetMetric label={copy.fleetMap} value={robot.activeMapId ?? copy.fleetUnknown} />
              <FleetMetric label={copy.fleetBattery} value={robot.batterySource === "UNAVAILABLE" ? "—" : `${robot.battery}%`} />
              <FleetMetric label={copy.fleetQueue} value={String(robot.queuedCount)} />
            </div>
          </button>;
        })}
      </div>

      {selected ? <aside aria-live="polite" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-400">{copy.fleetSelectedRobot}</p>
        <div className="mt-2 flex items-start justify-between gap-3"><div><h3 className="text-xl font-bold text-slate-950">{selected.name}</h3><p className="font-mono text-xs text-slate-500">{selected.id}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${selected.acceptsDeliveries ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{selected.acceptsDeliveries ? copy.fleetAccepting : copy.fleetUnavailable}</span></div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          <Detail label={copy.fleetState} value={robotStateLabel(selected.state, locale)} />
          <Detail label={copy.fleetPosition} value={`${selected.x.toFixed(2)}, ${selected.y.toFixed(2)} m`} />
          <Detail label={copy.fleetMap} value={selected.activeMapId ?? copy.fleetUnknown} />
          <Detail label={copy.fleetCurrentTask} value={selected.currentTaskId ?? copy.noMission} />
        </dl>
        <p className="mt-4 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-slate-600">{selected.unavailableReason ? unavailableReason(selected.unavailableReason, copy) : copy.fleetReadyDetail}</p>
      </aside> : null}
    </div> : null}
  </section>;
}

function Summary({ value, label, tone = "slate" }: { value: number; label: string; tone?: "slate" | "emerald" | "blue" | "amber" }) {
  const tones = { slate: "bg-slate-50 text-slate-700", emerald: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-800" };
  return <div className={`min-w-20 rounded-xl px-3 py-2 ${tones[tone]}`}><p className="text-lg font-bold leading-none">{value}</p><p className="mt-1 font-semibold">{label}</p></div>;
}

function FleetMetric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-slate-400">{label}</p><p className="mt-0.5 truncate font-semibold text-slate-700">{value}</p></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white p-3"><dt className="text-xs font-semibold text-slate-400">{label}</dt><dd className="mt-1 break-words text-sm font-bold text-slate-800">{value}</dd></div>;
}

function unavailableReason(reason: FleetUnavailableReason, copy: Record<string, string>) {
  const keys: Record<FleetUnavailableReason, string> = {
    ROBOT_OFFLINE: "fleetReasonOffline",
    ROBOT_NOT_PAIRED: "fleetReasonNotPaired",
    ROBOT_NOT_READY: "fleetReasonNotReady",
    NAVIGATION_UNAVAILABLE: "fleetReasonNavigation",
    ACTIVE_MAP_UNKNOWN: "fleetReasonMapUnknown",
    EMERGENCY_STOP_ACTIVE: "fleetReasonEmergency",
    MAPPING_ACTIVE: "fleetReasonMapping",
  };
  return copy[keys[reason]];
}
