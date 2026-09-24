"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import DashboardDeliveryMap from "@/components/DashboardDeliveryMap";
import EmergencyStopControl from "@/components/EmergencyStopControl";
import FleetOverview from "@/components/FleetOverview";
import NavigationMetrics from "@/components/NavigationMetrics";
import RobotOperationsControl from "@/components/RobotOperationsControl";
import StatusBadge from "@/components/StatusBadge";
import UserDashboard from "@/components/UserDashboard";
import WorkflowControls from "@/components/WorkflowControls";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText, dashboardOperationsText, dashboardText, formatDate, robotStateLabel } from "@/lib/i18n";
import { taskStatusCounts } from "@/lib/roleDashboard";
import { displayedTaskProgress } from "@/lib/taskProgress";
import type { DiagnosticLevel, DiagnosticStatus, FleetRobot, RobotDiagnostics } from "@/types";

const DIAGNOSTICS_FRESH_MS = 8_000;

type Issue = {
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  action?: string;
  href?: string;
  blocksDelivery: boolean;
};

export default function DashboardPage() {
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const copy = dashboardText[locale];
  const ui = adminUiText[locale];
  const operations = dashboardOperationsText[locale];
  const now = useCurrentTime();
  const { occupancyMap, navigationFeedback, diagnostics, robot, fleet, selectedRobotId, selectRobot, activeTask, tasks, stationName, backendOnline, emergencyStop } = useDeliveryApi();
  const counts = taskStatusCounts(tasks);
  const sensorStatuses = diagnostics?.statuses.filter((item) => !isNav2Diagnostic(item)) ?? [];
  const sensorDiagnostics: RobotDiagnostics | undefined = diagnostics ? { ...diagnostics, overallLevel: diagnosticOverallLevel(sensorStatuses), statuses: sensorStatuses } : undefined;
  const nav2Diagnostic = diagnostics?.statuses.find(isNav2Diagnostic);
  const localizationDiagnostic = diagnostics?.statuses.find(isLocalizationDiagnostic);
  const selectedFleetRobot = fleet.find((item) => item.id === robot.id);
  const robotConnected = backendOnline && robot.online;
  const diagnosticsFresh = Boolean(diagnostics && now > 0 && now - Date.parse(diagnostics.serverTime) <= DIAGNOSTICS_FRESH_MS);
  const livePose = Boolean(robotConnected && diagnosticsFresh && localizationDiagnostic?.level === "OK");
  const missionProgress = activeTask ? displayedTaskProgress(activeTask, navigationFeedback) : 0;
  const issues = useMemo(() => buildIssues({ backendOnline, robotOnline: robot.online, activeMapId: selectedFleetRobot?.activeMapId, occupancyMap: Boolean(occupancyMap), emergencyLatched: Boolean(emergencyStop?.latched), diagnostics, diagnosticsFresh, activeTask, tasks, locale }), [activeTask, backendOnline, diagnostics, diagnosticsFresh, emergencyStop?.latched, locale, occupancyMap, robot.online, selectedFleetRobot?.activeMapId, tasks]);
  const blockingIssues = issues.filter((issue) => issue.blocksDelivery);
  const readyForDelivery = blockingIssues.length === 0 && selectedFleetRobot?.readinessStatus === "READY";

  if (user?.role === "USER") return <UserDashboard />;

  return <>
    <header className="flex flex-wrap items-start justify-between gap-5">
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">{ui.operationsOverview}</h1><p className="mt-1 text-sm text-slate-500">{ui.operationsDescription}</p></div>
      <div className="flex flex-wrap items-center justify-end gap-2" aria-label={operations.operationalReadiness}>
        <Connection label="API" state={backendOnline ? "active" : "inactive"} />
        <Connection label="Robot Agent" state={robotConnected ? "active" : "inactive"} />
        <Connection label={operations.currentMap} state={occupancyMap ? "active" : "inactive"} />
        <EmergencyStopControl compact />
      </div>
    </header>

    <section aria-label={ui.liveOperations} className="mt-4 grid gap-3 md:grid-cols-3">
      <RobotSelectorCard fleet={fleet} selectedRobotId={selectedRobotId || robot.id} onSelect={selectRobot} label={ui.robotAvailability} onlineLabel={ui.online} offlineLabel={ui.offline} />
      <OverviewCard icon="health" label={operations.operationalReadiness} value={readyForDelivery ? operations.readyForDelivery : operations.blocked} detail={readyForDelivery ? operations.allOperational : `${blockingIssues.length} ${blockingIssues.length === 1 ? operations.notice : operations.notices}`} tone={readyForDelivery ? "emerald" : "amber"} />
      <OverviewCard icon="mission" label={operations.workload} value={activeTask?.id ?? ui.noMission} detail={counts.queued > 0 ? operations.queued.replace("{count}", String(counts.queued)) : operations.queueEmpty} tone={activeTask ? "blue" : "violet"} />
    </section>

    <section className="mt-4 grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,21rem)_minmax(18rem,21rem)]">
      <DashboardDeliveryMap poseLive={livePose} />
      <aside className="min-w-0 space-y-4" aria-label={operations.selectedRobot}>
        <SelectedRobotPanel robot={robot} robotConnected={robotConnected} activeTask={activeTask} activeMapId={selectedFleetRobot?.activeMapId} localizationDiagnostic={localizationDiagnostic} nav2Diagnostic={nav2Diagnostic} locale={locale} copy={copy} ui={ui} operations={operations} taskStatusLabel={activeTask ? t("taskStatus")[activeTask.status] : undefined} />
        <CompactDiagnostics diagnostics={sensorDiagnostics} fresh={diagnosticsFresh} locale={locale} operations={operations} />
        <ActiveIssues issues={issues} operations={operations} />
        <RobotOperationsControl compact defaultExpanded={blockingIssues.length > 0} />
      </aside>
      <aside className="min-w-0 space-y-4" aria-label={ui.controlAndSafety}>
        <MissionPanel activeTask={activeTask} missionProgress={missionProgress} navigationFeedback={navigationFeedback} stationName={stationName} ui={ui} operations={operations} readyForDelivery={readyForDelivery} />
        <RobotOperationsControl mode="admin" collapsible />
      </aside>
    </section>

    <section className="mt-4"><FleetOverview /></section>
    <section className="mt-4"><RecentActivity tasks={tasks.slice(0, 5)} stationName={stationName} copy={copy} ui={ui} /></section>
  </>;
}

function SelectedRobotPanel({ robot, robotConnected, activeTask, activeMapId, localizationDiagnostic, nav2Diagnostic, locale, copy, ui, operations, taskStatusLabel }: {
  robot: ReturnType<typeof useDeliveryApi>["robot"];
  robotConnected: boolean;
  activeTask: ReturnType<typeof useDeliveryApi>["activeTask"];
  activeMapId?: string;
  localizationDiagnostic?: DiagnosticStatus;
  nav2Diagnostic?: DiagnosticStatus;
  locale: "en" | "th";
  copy: (typeof dashboardText)[keyof typeof dashboardText];
  ui: (typeof adminUiText)[keyof typeof adminUiText];
  operations: (typeof dashboardOperationsText)[keyof typeof dashboardOperationsText];
  taskStatusLabel?: string;
}) {
  const connectionLabel = robotConnected ? operations.live : operations.offline;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="font-bold text-slate-950">{operations.selectedRobot}</h2><p className="mt-1 truncate font-mono text-[10px] text-slate-400" title={robot.id}>{robot.id}</p></div><StatePill state={robotConnected ? "active" : "inactive"} label={connectionLabel} /></div>
    <div className="mt-4 flex items-center gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-950"><span className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: "url('/auth/delivery-robot-mark.png')", backgroundSize: "290% auto" }} /></span><div className="min-w-0"><h3 className="truncate font-bold text-slate-950">{robot.name}</h3><p className="mt-1 text-xs text-slate-500">{robotStateLabel(robot.state, locale)}</p></div></div>
    <dl className="mt-4 grid grid-cols-2 gap-2"><Detail label={ui.robotPosition} value={`${robot.x.toFixed(2)}, ${robot.y.toFixed(2)} m`} /><Detail label={operations.battery} value={robot.batterySource === "UNAVAILABLE" ? "—" : robot.batterySource === "SIMULATED" ? `${robot.battery}% (${ui.simulatedCharge})` : `${robot.battery}%`} /><Detail label={operations.currentMap} value={activeMapId ?? ui.fleetUnknown} /><Detail label={copy.mission} value={activeTask?.id ?? ui.noMission} /><Detail label={operations.localization} value={localizationDiagnostic?.level === "OK" ? ui.ready : localizationDiagnostic?.message ?? operations.waiting} /><Detail label={operations.navigation} value={nav2Diagnostic?.message ?? taskStatusLabel ?? ui.missionStandby} /></dl>
    <p className="mt-3 text-xs text-slate-500">{ui.lastSeen}: {formatDate(robot.lastSeen, locale)}</p>
  </section>;
}

function MissionPanel({ activeTask, missionProgress, navigationFeedback, stationName, ui, operations, readyForDelivery }: {
  activeTask: ReturnType<typeof useDeliveryApi>["activeTask"];
  missionProgress: number;
  navigationFeedback: ReturnType<typeof useDeliveryApi>["navigationFeedback"];
  stationName: (id: string) => string;
  ui: (typeof adminUiText)[keyof typeof adminUiText];
  operations: (typeof dashboardOperationsText)[keyof typeof dashboardOperationsText];
  readyForDelivery: boolean;
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">{ui.currentMission}</p>
    {activeTask ? <><div className="mt-2 flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-bold text-slate-950">{activeTask.id}</h2><p className="mt-1 truncate text-xs text-slate-500" title={`${stationName(activeTask.pickupStationId)} → ${stationName(activeTask.destinationStationId)}`}>{stationName(activeTask.pickupStationId)} → {stationName(activeTask.destinationStationId)}</p></div><StatusBadge status={activeTask.status} /></div><div className="mt-3 flex items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-[width]" style={{ width: `${missionProgress}%` }} /></div><span className="text-xs font-bold text-slate-500">{Math.round(missionProgress)}%</span></div></> : <div className="mt-2 rounded-xl bg-slate-50 p-4"><h2 className="font-bold text-slate-950">{ui.noMission}</h2><p className="mt-1 text-xs leading-5 text-slate-500">{operations.noMissionHelp}</p><Link href={readyForDelivery ? "/delivery" : "/maps?view=localization"} className="mt-3 inline-flex min-h-10 items-center rounded-xl bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">{readyForDelivery ? operations.createDelivery : operations.setRobotPosition}</Link></div>}
    <div className="mt-3"><NavigationMetrics compact layout="rail" feedback={navigationFeedback} taskId={activeTask?.id} status={activeTask?.status} /></div>
    {activeTask && <WorkflowControls compact />}
  </section>;
}

function ActiveIssues({ issues, operations }: { issues: Issue[]; operations: (typeof dashboardOperationsText)[keyof typeof dashboardOperationsText] }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-950">{operations.activeIssues}</h2><Link href="/notifications" className="min-h-10 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{operations.viewAll}</Link></div>{issues.length === 0 ? <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-3 text-sm font-semibold text-emerald-700">✓ {operations.allOperational}</p> : <div className="mt-2 divide-y divide-slate-100">{issues.slice(0, 5).map((issue, index) => <article key={`${issue.title}-${index}`} className="flex gap-3 py-3"><span aria-hidden="true" className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${issue.severity === "critical" ? "bg-red-600" : issue.severity === "warning" ? "bg-amber-500" : "bg-slate-500"}`}>!</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-bold text-slate-900">{issue.title}</p>{!issue.blocksDelivery && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{operations.historicalNotice}</span>}</div><p className="mt-1 text-xs leading-5 text-slate-500">{issue.detail}</p>{issue.action && issue.href && <Link href={issue.href} className="mt-2 inline-flex min-h-10 items-center rounded-lg border border-slate-200 px-3 text-xs font-bold text-blue-700 hover:border-blue-300 hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-500">{issue.action}</Link>}</div></article>)}</div>}</section>;
}

function CompactDiagnostics({ diagnostics, fresh, locale, operations }: { diagnostics?: RobotDiagnostics; fresh: boolean; locale: "en" | "th"; operations: (typeof dashboardOperationsText)[keyof typeof dashboardOperationsText] }) {
  const statuses = diagnostics?.statuses ?? [];
  const healthy = fresh ? statuses.filter((item) => item.level === "OK").length : 0;
  const warning = fresh ? statuses.filter((item) => item.level === "WARN").length : 0;
  const error = fresh ? statuses.filter((item) => item.level === "ERROR").length : 0;
  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-950">{locale === "th" ? "สุขภาพเซ็นเซอร์และหัวข้อ" : "Sensor & Topic Health"}</h2><Link href="/diagnostics" className="min-h-10 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{locale === "th" ? "รายละเอียด" : "View details"}</Link></div><div className="mt-3 grid grid-cols-4 gap-2 text-center"><Metric value={healthy} label={operations.healthy} tone="emerald" /><Metric value={warning} label={operations.warning} tone="amber" /><Metric value={error} label={operations.error} tone="red" /><Metric value={!fresh && diagnostics ? statuses.length : 0} label={operations.stale} tone="slate" /></div><div className="mt-3 grid gap-x-5 gap-y-2 sm:grid-cols-2">{statuses.slice(0, 6).map((status) => <div key={status.name} className="flex items-center justify-between gap-2 text-xs"><span className="truncate text-slate-700">{status.name.replace("AMR/", "")}</span><span className={fresh && status.level === "OK" ? "text-emerald-700" : fresh && status.level === "ERROR" ? "text-red-700" : "text-amber-700"}>{fresh ? status.level : operations.stale}</span></div>)}</div></section>;
}

function RecentActivity({ tasks, stationName, copy, ui }: { tasks: ReturnType<typeof useDeliveryApi>["tasks"]; stationName: (id: string) => string; copy: (typeof dashboardText)[keyof typeof dashboardText]; ui: (typeof adminUiText)[keyof typeof adminUiText] }) { return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-950">{ui.recentActivity}</h2><Link href="/tasks" className="min-h-10 rounded-lg px-2 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50">{ui.viewAllTasks}</Link></div><div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead className="border-b border-slate-200 uppercase tracking-wide text-slate-400"><tr><th className="px-2 py-2">{copy.task}</th><th className="px-2 py-2">{copy.pickup}</th><th className="px-2 py-2">{copy.destination}</th><th className="px-2 py-2">{copy.status}</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id} className="border-b border-slate-100 last:border-0"><td className="px-2 py-3 font-semibold">{task.id}</td><td className="px-2 py-3 text-slate-600">{stationName(task.pickupStationId)}</td><td className="px-2 py-3 text-slate-600">{stationName(task.destinationStationId)}</td><td className="px-2 py-3"><StatusBadge status={task.status} /></td></tr>)}</tbody></table></div></section>; }

function buildIssues({ backendOnline, robotOnline, activeMapId, occupancyMap, emergencyLatched, diagnostics, diagnosticsFresh, activeTask, tasks, locale }: { backendOnline: boolean; robotOnline: boolean; activeMapId?: string; occupancyMap: boolean; emergencyLatched: boolean; diagnostics?: RobotDiagnostics; diagnosticsFresh: boolean; activeTask?: { id: string }; tasks: { id: string; status: string }[]; locale: "en" | "th" }): Issue[] {
  const en = locale === "en";
  const copy = dashboardOperationsText[locale];
  const result: Issue[] = [];
  if (emergencyLatched) result.push({ severity: "critical", title: en ? "Emergency stop active" : "ระบบหยุดฉุกเฉินทำงานอยู่", detail: en ? "Robot motion is disabled until the stop is reset." : "การเคลื่อนที่ถูกปิดจนกว่าจะรีเซ็ตการหยุดฉุกเฉิน", action: copy.openDiagnostics, href: "/diagnostics", blocksDelivery: true });
  if (!backendOnline) result.push({ severity: "critical", title: en ? "API unavailable" : "API ไม่พร้อมใช้งาน", detail: en ? "The control plane cannot be reached." : "ไม่สามารถเชื่อมต่อระบบควบคุมได้", action: copy.openDiagnostics, href: "/diagnostics", blocksDelivery: true });
  else if (!robotOnline) result.push({ severity: "critical", title: en ? "Robot Agent is offline" : "Robot Agent ออฟไลน์", detail: en ? "No Agent connection is available for the selected robot." : "ไม่มีการเชื่อมต่อ Agent สำหรับหุ่นยนต์ที่เลือก", action: copy.openDiagnostics, href: "/diagnostics", blocksDelivery: true });
  if (!occupancyMap) result.push({ severity: "warning", title: activeMapId ? copy.mapUnavailable : copy.noActiveMap, detail: activeMapId ? copy.mapUnavailableDetail : copy.noActiveMapDetail, action: copy.openMapManagement, href: "/maps", blocksDelivery: true });
  const localization = diagnostics?.statuses.find(isLocalizationDiagnostic);
  if (activeMapId && localization && localization.level !== "OK") result.push({ severity: localization.level === "ERROR" ? "critical" : "warning", title: copy.amclUnavailable, detail: localization.message || copy.amclUnavailableDetail, action: copy.setRobotPosition, href: "/maps?view=localization", blocksDelivery: true });
  else if (activeMapId && (!localization || !diagnosticsFresh) && robotOnline) result.push({ severity: "warning", title: copy.amclUnavailable, detail: copy.amclUnavailableDetail, action: copy.setRobotPosition, href: "/maps?view=localization", blocksDelivery: true });
  diagnostics?.statuses.filter((item) => item.level === "ERROR" && !isLocalizationDiagnostic(item)).slice(0, 2).forEach((item) => result.push({ severity: "critical", title: item.name, detail: item.message || (en ? "ROS diagnostic error" : "ข้อผิดพลาด ROS diagnostic"), action: copy.openDiagnostics, href: "/diagnostics", blocksDelivery: true }));
  const failed = tasks.find((task) => task.status === "FAILED");
  if (failed && !activeTask) result.push({ severity: "info", title: en ? "Last mission failed" : "ภารกิจล่าสุดล้มเหลว", detail: `${failed.id} · ${copy.failedMissionHistory}`, action: copy.viewFailedTask, href: "/tasks", blocksDelivery: false });
  return result;
}

function OverviewCard({ icon, label, value, detail, tone }: { icon: "robot" | "mission" | "queue" | "health"; label: string; value: string; detail: string; tone: "emerald" | "blue" | "amber" | "violet" }) { const styles = { emerald: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", amber: "bg-amber-50 text-amber-700", violet: "bg-violet-50 text-violet-700" }; return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${styles[tone]}`}><OverviewIcon name={icon} /></span><div className="min-w-0"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p><p className="mt-1 truncate text-xs text-slate-500">{detail}</p></div></div></article>; }
function RobotSelectorCard({ fleet, selectedRobotId, onSelect, label, onlineLabel, offlineLabel }: { fleet: FleetRobot[]; selectedRobotId: string; onSelect: (robotId: string) => void; label: string; onlineLabel: string; offlineLabel: string }) { const selected = fleet.find((item) => item.id === selectedRobotId) ?? fleet[0]; const onlineCount = fleet.filter((item) => item.online).length; return <article className="rounded-2xl border border-blue-200 bg-white p-4 shadow-sm ring-1 ring-blue-50"><div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><OverviewIcon name="robot" /></span><div className="min-w-0 flex-1"><label htmlFor="dashboard-robot-selector" className="text-xs font-semibold text-slate-500">{label} · {onlineCount} / {fleet.length} {onlineLabel}</label><select id="dashboard-robot-selector" value={selected?.id ?? ""} disabled={fleet.length === 0} onChange={(event) => onSelect(event.target.value)} className="mt-1 block min-h-10 w-full cursor-pointer truncate rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm font-bold text-slate-950 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50">{fleet.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.online ? onlineLabel : offlineLabel}</option>)}</select></div></div></article>; }
function Metric({ value, label, tone }: { value: number; label: string; tone: "emerald" | "amber" | "red" | "slate" }) { const styles = { emerald: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", red: "bg-red-50 text-red-700", slate: "bg-slate-100 text-slate-600" }; return <div className={`rounded-lg p-2 ${styles[tone]}`}><p className="text-lg font-bold">{value}</p><p className="truncate text-[9px] font-semibold">{label}</p></div>; }
function Connection({ label, state }: { label: string; state: "active" | "stale" | "inactive" }) { return <span className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-2 text-xs font-semibold ${state === "active" ? "border-emerald-100 bg-emerald-50 text-emerald-700" : state === "stale" ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}><span className={`h-2 w-2 rounded-full ${state === "active" ? "bg-emerald-500" : state === "stale" ? "bg-amber-500" : "bg-slate-400"}`} />{label}</span>; }
function StatePill({ state, label }: { state: "active" | "stale" | "inactive"; label: string }) { return <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${state === "active" ? "bg-emerald-100 text-emerald-700" : state === "stale" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{label}</span>; }
function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0 rounded-lg bg-slate-50 p-2.5"><dt className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd className="mt-1 truncate text-xs font-semibold text-slate-800" title={value}>{value}</dd></div>; }
function isNav2Diagnostic(status: DiagnosticStatus): boolean { const name = status.name.toLowerCase(); return name.includes("lifecycle_manager_navigation") || name.includes("nav2 health"); }
function isLocalizationDiagnostic(status: DiagnosticStatus): boolean { const name = status.name.toLowerCase(); return status.name === "AMR/Localization" || name.includes("lifecycle_manager_localization") || name.includes("amcl"); }
function diagnosticOverallLevel(statuses: DiagnosticStatus[]): DiagnosticLevel { const severity: Record<DiagnosticLevel, number> = { OK: 0, WARN: 1, ERROR: 2, STALE: 3 }; return statuses.reduce<DiagnosticLevel>((overall, status) => severity[status.level] > severity[overall] ? status.level : overall, statuses.length > 0 ? "OK" : "STALE"); }
function useCurrentTime() { const [now, setNow] = useState(0); useEffect(() => { setNow(Date.now()); const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []); return now; }
function OverviewIcon({ name }: { name: "robot" | "mission" | "queue" | "health" }) { const common = "h-5 w-5"; if (name === "robot") return <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="7" width="16" height="12" rx="3" /><path d="M12 7V4M8 12h.01M16 12h.01M8 16h8" strokeLinecap="round" /></svg>; if (name === "mission") return <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8" /><path d="m9 12 2 2 4-5" /></svg>; if (name === "queue") return <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" /></svg>; return <svg aria-hidden="true" className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13h4l2-6 4 12 2-6h4" /><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" /></svg>; }
