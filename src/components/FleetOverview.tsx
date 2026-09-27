"use client";

import { useMemo, useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText, robotStateLabel } from "@/lib/i18n";
import type { FleetRobot } from "@/types";

type FleetFilter = "all" | "active" | "attention" | "offline";

export default function FleetOverview() {
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const { fleet, selectedRobotId, selectRobot, loading } = useDeliveryApi();
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [query, setQuery] = useState("");
  const selected = fleet.find((robot) => robot.id === selectedRobotId) ?? fleet[0];
  const summary = useMemo(() => ({
    connected: fleet.filter((robot) => robot.online).length,
    active: fleet.filter((robot) => Boolean(robot.currentTaskId)).length,
    attention: fleet.filter((robot) => !robot.acceptsDeliveries).length,
  }), [fleet]);
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase(locale);
    return fleet.filter((robot) => {
      const matchesFilter = filter === "all"
        || (filter === "active" && Boolean(robot.currentTaskId))
        || (filter === "attention" && !robot.acceptsDeliveries)
        || (filter === "offline" && !robot.online);
      const haystack = `${robot.name} ${robot.id} ${robot.activeMapId ?? ""} ${robot.currentTaskId ?? ""}`.toLocaleLowerCase(locale);
      return matchesFilter && (!normalized || haystack.includes(normalized));
    });
  }, [filter, fleet, locale, query]);

  return <section aria-labelledby="fleet-overview-title" className="rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div><p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">{copy.fleetOperations}</p><h2 id="fleet-overview-title" className="mt-1 text-lg font-bold text-slate-950">{copy.fleetOverview}</h2><p className="mt-1 text-xs text-slate-500">{copy.fleetOverviewHelp}</p></div>
      <div className="flex flex-wrap gap-2 text-xs"><Summary value={fleet.length} label={copy.fleetTotal}/><Summary value={summary.connected} label={copy.fleetConnected} tone="emerald"/><Summary value={summary.active} label={copy.fleetActive} tone="blue"/><Summary value={summary.attention} label={copy.fleetAttention} tone={summary.attention ? "amber" : "slate"}/></div>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-slate-100 px-4 py-3">
      <label className="min-w-52 flex-1"><span className="sr-only">{copy.fleetSearch}</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.fleetSearch} className="min-h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>
      <div className="flex flex-wrap gap-1" role="group" aria-label={copy.fleetFilter}><FilterButton active={filter === "all"} onClick={() => setFilter("all")}>{copy.fleetFilterAll}</FilterButton><FilterButton active={filter === "active"} onClick={() => setFilter("active")}>{copy.fleetActive}</FilterButton><FilterButton active={filter === "attention"} onClick={() => setFilter("attention")}>{copy.fleetAttention}</FilterButton><FilterButton active={filter === "offline"} onClick={() => setFilter("offline")}>{copy.offline}</FilterButton></div>
    </div>
    {selected && <p className="sr-only" aria-live="polite">{selected.x.toFixed(2)}, {selected.y.toFixed(2)} m; {selected.activeMapId ?? copy.fleetUnknown}; {selected.currentTaskId ?? copy.noMission}</p>}
    {loading && fleet.length === 0 ? <p className="p-5 text-sm text-slate-500">{copy.fleetLoading}</p> : null}
    {!loading && fleet.length === 0 ? <p className="p-5 text-sm text-slate-500">{copy.fleetEmpty}</p> : null}
    {fleet.length > 0 && visible.length === 0 ? <p className="p-5 text-sm text-slate-500">{copy.fleetNoMatches}</p> : null}
    {visible.length > 0 && <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><thead className="border-b border-slate-100 text-xs font-semibold uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">{copy.fleetRobot}</th><th className="px-3 py-3">{copy.fleetState}</th><th className="px-3 py-3">{copy.fleetCurrentTask}</th><th className="px-3 py-3">{copy.fleetMap}</th><th className="px-3 py-3">{copy.fleetReadiness}</th><th className="px-5 py-3">{copy.fleetFreshness}</th></tr></thead><tbody>{visible.map((robot) => <RobotRow key={robot.id} robot={robot} active={robot.id === selected?.id} locale={locale} copy={copy} onSelect={() => selectRobot(robot.id)} />)}</tbody></table></div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,16rem),1fr))] gap-3 p-4 md:hidden">{visible.map((robot) => <RobotCard key={robot.id} robot={robot} active={robot.id === selected?.id} locale={locale} copy={copy} onSelect={() => selectRobot(robot.id)} />)}</div>
    </>}
  </section>;
}

function RobotRow({ robot, active, locale, copy, onSelect }: { robot: FleetRobot; active: boolean; locale: "en" | "th"; copy: Record<string, string>; onSelect: () => void }) {
  return <tr tabIndex={0} role="button" aria-pressed={active} onClick={onSelect} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(); } }} className={`cursor-pointer border-b border-slate-100 last:border-0 outline-none transition hover:bg-slate-50 focus:bg-blue-50 ${active ? "bg-blue-50/80" : ""}`}>
    <td className="px-5 py-3"><p className="font-semibold text-slate-950">{robot.name}</p><p className="mt-0.5 font-mono text-xs text-slate-400">{robot.id}</p></td>
    <td className="px-3 py-3"><State online={robot.online} label={robot.online ? robotStateLabel(robot.state, locale) : copy.offline}/><p className="mt-1 text-xs text-slate-400">{robot.batterySource === "UNAVAILABLE" ? copy.batteryUnavailable : `${robot.battery}%`}</p></td>
    <td className="px-3 py-3 text-slate-700"><p className="max-w-36 truncate">{robot.currentTaskId ?? copy.noMission}</p><p className="mt-1 text-xs text-slate-400">{robot.queuedCount ? copy.fleetQueued.replace("{count}", String(robot.queuedCount)) : copy.fleetQueueEmpty}</p></td>
    <td className="px-3 py-3 text-slate-600"><p className="max-w-40 truncate">{robot.activeMapId ?? copy.fleetUnknown}</p><p className="mt-0.5 text-xs text-slate-400">{robot.x.toFixed(2)}, {robot.y.toFixed(2)} m</p></td>
    <td className="px-3 py-3"><State online={robot.acceptsDeliveries} label={robot.acceptsDeliveries ? copy.ready : robot.readinessStatus === "DEGRADED" ? copy.fleetDegraded : copy.fleetNotReady}/><p className="mt-1 max-w-48 truncate text-xs text-slate-400" title={robot.readinessDetail}>{checkSummary(robot, copy)}</p></td>
    <td className="px-5 py-3 text-xs text-slate-500"><p>{relativeTime(robot.lastSeen, locale)}</p><p className="mt-1 text-slate-400">{copy.fleetReadinessUpdate}: {relativeTime(robot.readinessUpdatedAt, locale)}</p></td>
  </tr>;
}

function RobotCard({ robot, active, locale, copy, onSelect }: { robot: FleetRobot; active: boolean; locale: "en" | "th"; copy: Record<string, string>; onSelect: () => void }) {
  return <button type="button" aria-pressed={active} onClick={onSelect} className={`rounded-xl border p-4 text-left focus:outline-none focus:ring-2 focus:ring-blue-500 ${active ? "border-blue-400 bg-blue-50" : "border-slate-200"}`}><div className="flex justify-between gap-2"><span className="font-semibold text-slate-950">{robot.name}</span><State online={robot.online} label={robot.online ? copy.online : copy.offline}/></div><p className="mt-2 text-xs text-slate-500">{robotStateLabel(robot.state, locale)} · {robot.x.toFixed(2)}, {robot.y.toFixed(2)} m</p><p className="mt-2 truncate text-xs text-slate-500">{robot.activeMapId ?? copy.fleetUnknown} · {robot.currentTaskId ?? copy.noMission}</p><div className="mt-3 flex items-center justify-between gap-2"><State online={robot.acceptsDeliveries} label={robot.acceptsDeliveries ? copy.ready : copy.fleetNotReady}/><span className="text-xs text-slate-400">{relativeTime(robot.lastSeen, locale)}</span></div></button>;
}

function checkSummary(robot: FleetRobot, copy: Record<string, string>) { const failed = robot.validationResults.filter((item) => item.status === "FAIL").length; const warned = robot.validationResults.filter((item) => item.status === "WARN").length; if (failed) return copy.fleetFailedChecks.replace("{count}", String(failed)); if (warned) return copy.fleetWarningChecks.replace("{count}", String(warned)); return robot.readinessDetail || copy.fleetReadyDetail; }
function relativeTime(value: string | undefined, locale: "en" | "th") { const time = value ? Date.parse(value) : Number.NaN; if (!Number.isFinite(time)) return locale === "th" ? "ยังไม่เคย" : "Never"; const seconds = Math.max(0, Math.round((Date.now() - time) / 1000)); if (seconds < 5) return locale === "th" ? "เมื่อสักครู่" : "Just now"; if (seconds < 60) return locale === "th" ? `${seconds} วินาทีที่แล้ว` : `${seconds}s ago`; const minutes = Math.round(seconds / 60); return locale === "th" ? `${minutes} นาทีที่แล้ว` : `${minutes}m ago`; }
function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) { return <button type="button" aria-pressed={active} onClick={onClick} className={`min-h-10 rounded-xl px-3 text-xs font-semibold ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{children}</button>; }
function Summary({ value, label, tone = "slate" }: { value: number; label: string; tone?: "slate" | "emerald" | "amber" | "blue" }) { const tones = { slate: "bg-slate-100 text-slate-700", emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-800", blue: "bg-blue-50 text-blue-700" }; return <div className={`rounded-lg px-2.5 py-1.5 ${tones[tone]}`}><p className="font-bold leading-none">{value}</p><p className="mt-1 text-[10px] font-semibold">{label}</p></div>; }
function State({ online, label }: { online: boolean; label: string }) { return <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold ${online ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}><span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-emerald-500" : "bg-slate-400"}`}/>{label}</span>; }
