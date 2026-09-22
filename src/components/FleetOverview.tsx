"use client";

import { useMemo } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText, robotStateLabel } from "@/lib/i18n";

export default function FleetOverview() {
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const { fleet, selectedRobotId, selectRobot, loading } = useDeliveryApi();
  const selected = fleet.find((robot) => robot.id === selectedRobotId) ?? fleet[0];
  const summary = useMemo(() => ({
    connected: fleet.filter((robot) => robot.online).length,
    attention: fleet.filter((robot) => !robot.acceptsDeliveries).length,
  }), [fleet]);

  return <section aria-labelledby="fleet-overview-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">{copy.fleetOperations}</p><h2 id="fleet-overview-title" className="mt-1 text-lg font-bold text-slate-950">{copy.fleetOverview}</h2></div>
        <div className="flex gap-2 text-xs"><Summary value={fleet.length} label={copy.fleetTotal}/><Summary value={summary.connected} label={copy.fleetConnected} tone="emerald"/><Summary value={summary.attention} label={copy.fleetAttention} tone={summary.attention ? "amber" : "slate"}/></div>
      </div>
      {selected && <p className="sr-only" aria-live="polite">{selected.x.toFixed(2)}, {selected.y.toFixed(2)} m; {selected.activeMapId ?? copy.fleetUnknown}; {selected.currentTaskId ?? copy.noMission}</p>}
    {loading && fleet.length === 0 ? <p className="p-5 text-sm text-slate-500">{copy.fleetLoading}</p> : null}
    {!loading && fleet.length === 0 ? <p className="p-5 text-sm text-slate-500">{copy.fleetEmpty}</p> : null}
    {fleet.length > 0 && <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">Robot</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Battery</th><th className="px-3 py-3">Mission</th><th className="px-3 py-3">Map / Position</th><th className="px-5 py-3">Health</th></tr></thead><tbody>{fleet.map((robot) => { const active = robot.id === selected?.id; return <tr key={robot.id} tabIndex={0} role="button" aria-pressed={active} onClick={() => selectRobot(robot.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); selectRobot(robot.id); } }} className={`cursor-pointer border-b border-slate-100 last:border-0 outline-none transition hover:bg-slate-50 focus:bg-blue-50 ${active ? "bg-blue-50/80" : ""}`}><td className="px-5 py-3"><p className="font-semibold text-slate-950">{robot.name}</p><p className="mt-0.5 font-mono text-xs text-slate-400">{robot.id}</p></td><td className="px-3 py-3"><State online={robot.online} label={robot.online ? copy.online : copy.offline}/></td><td className="px-3 py-3 text-slate-700">{robot.batterySource === "UNAVAILABLE" ? "—" : `${robot.battery}%`}</td><td className="px-3 py-3 text-slate-700">{robot.currentTaskId ?? copy.noMission}</td><td className="px-3 py-3 text-slate-600"><p className="max-w-40 truncate">{robot.activeMapId ?? copy.fleetUnknown}</p><p className="mt-0.5 text-xs text-slate-400">{robot.x.toFixed(2)}, {robot.y.toFixed(2)} m</p></td><td className="px-5 py-3"><State online={robot.acceptsDeliveries} label={robot.acceptsDeliveries ? copy.ready : robot.readinessStatus === "DEGRADED" ? copy.fleetDegraded : copy.fleetNotReady}/></td></tr>; })}</tbody></table></div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3 p-4 md:hidden">{fleet.map((robot) => { const active = robot.id === selected?.id; return <button key={robot.id} type="button" aria-pressed={active} onClick={() => selectRobot(robot.id)} className={`rounded-xl border p-4 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}><div className="flex justify-between gap-2"><span className="font-semibold text-slate-950">{robot.name}</span><State online={robot.online} label={robot.online ? copy.online : copy.offline}/></div><p className="mt-2 text-xs text-slate-500">{robotStateLabel(robot.state, locale)} · {robot.x.toFixed(2)}, {robot.y.toFixed(2)} m</p></button>; })}</div>
    </>}
  </section>;
}

function Summary({ value, label, tone = "slate" }: { value: number; label: string; tone?: "slate" | "emerald" | "amber" }) { const tones = { slate: "bg-slate-100 text-slate-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800" }; return <div className={`rounded-lg px-2.5 py-1.5 ${tones[tone]}`}><p className="font-bold leading-none">{value}</p><p className="mt-1 text-[10px] font-semibold">{label}</p></div>; }
function State({ online, label }: { online: boolean; label: string }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}><span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}`}/>{label}</span>; }
