"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import RobotMap from "@/components/RobotMap";
import StatusBadge from "@/components/StatusBadge";
import WorkflowControls from "@/components/WorkflowControls";
import NavigationMetrics from "@/components/NavigationMetrics";
import EmergencyStopControl from "@/components/EmergencyStopControl";
import DiagnosticsCards from "@/components/DiagnosticsCards";
import UserDashboard from "@/components/UserDashboard";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText, dashboardText, formatDate, robotStateLabel, robotText } from "@/lib/i18n";
import { taskStatusCounts } from "@/lib/roleDashboard";
import { displayedTaskProgress } from "@/lib/taskProgress";

export default function DashboardPage() {
  const { user } = useAuth();
  const { locale, t } = useLocale();
  const copy = dashboardText[locale];
  const ui = adminUiText[locale];
  const robotCopy = robotText[locale];
  const now = useCurrentTime();
  const { occupancyMap, navigationFeedback, diagnostics, robot, activeTask, tasks, stationName, backendOnline } = useDeliveryApi();
  const counts = taskStatusCounts(tasks);

  if (user?.role === "USER") return <UserDashboard />;

  const diagnosticIssues = diagnostics?.statuses.filter((item) => item.level !== "OK") ?? [];
  const robotConnected = backendOnline && robot.online;
  const systemHealthy = robotConnected && diagnosticIssues.length === 0;
  const missionProgress = activeTask
    ? displayedTaskProgress(activeTask, navigationFeedback)
    : 0;
  const localizationDiagnostic = diagnostics?.statuses.find(
    (item) => item.name === "AMR/Localization"
  );
  const diagnosticsFresh = Boolean(
    diagnostics
    && now - Date.parse(diagnostics.serverTime) <= 5000
  );

  return <>
    <PageHeader title={ui.operationsOverview} description={ui.operationsDescription} />

    <section aria-label={ui.controlAndSafety} className="mt-6">
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{ui.controlAndSafety}</p>
      <EmergencyStopControl />
    </section>

    <section aria-label={ui.liveOperations} className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <OverviewCard icon="robot" label={ui.robotAvailability} value={robot.online ? ui.online : ui.offline} detail={`${robot.name} · ${robot.batterySource === "SIMULATED" ? ui.simulatedCharge : robot.batterySource === "SENSOR" ? `${robot.battery}%` : ui.batteryUnavailable}`} tone={robot.online ? "emerald" : "red"} />
      <OverviewCard icon="mission" label={ui.activeMission} value={activeTask?.id ?? ui.noMission} detail={activeTask ? t("taskStatus")[activeTask.status] : robotStateLabel(robot.state, locale)} tone={activeTask ? "blue" : "slate"} />
      <OverviewCard icon="queue" label={ui.queue} value={String(counts.queued)} detail={`${ui.waitingJobs.replace("{count}", String(counts.queued))} · ${ui.failedJobs.replace("{count}", String(counts.failed))}`} tone={counts.failed ? "amber" : "violet"} />
      <OverviewCard icon="health" label={ui.systemHealth} value={systemHealthy ? ui.ready : ui.attention} detail={systemHealthy ? ui.allHealthy : ui.diagnosticsNeedAttention} tone={systemHealthy ? "emerald" : "amber"} />
    </section>

    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-6 p-5 md:p-6 xl:grid-cols-[1.15fr_.85fr]">
        <div className="flex min-w-0 items-start gap-4">
          <div className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-blue-950/95 shadow-sm ring-1 ring-blue-900"><span aria-hidden="true" className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: "url('/auth/delivery-robot-mark.png')", backgroundSize: "290% auto" }} /></div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h2 className="text-2xl font-bold text-slate-950">{robot.name}</h2><StatePill active={robotConnected} label={robotConnected ? robotCopy.online : robotCopy.offline}/></div>
            <p className="mt-1 text-sm text-slate-500">{robotCopy.robotId}: {robot.id}</p>
            <div className="mt-4 flex flex-wrap gap-2"><SmallPill label={robotCopy.state} value={robotStateLabel(robot.state, locale)}/><SmallPill label={robotCopy.activeTask} value={activeTask?.id ?? robotCopy.none}/><SmallPill label={ui.sensorHealth} value={diagnosticIssues.length === 0 ? ui.ready : `${diagnosticIssues.length} ${ui.attention.toLowerCase()}`}/></div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{robot.batterySource === "SIMULATED" ? ui.simulatedCharge : robot.batterySource === "SENSOR" ? ui.measuredCharge : ui.batteryUnavailable}</p><p className="mt-1 text-2xl font-bold text-slate-950">{robot.batterySource === "UNAVAILABLE" ? "—" : `${robot.battery}%`}</p></div><svg className="h-6 w-6 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="7" width="17" height="10" rx="2"/><path d="M20 10h2v4h-2M7 10v4M11 10v4M15 10v4"/></svg></div>{robot.batterySource !== "UNAVAILABLE" && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${robot.battery < 20 ? "bg-red-500" : robot.battery < 40 ? "bg-amber-500" : "bg-emerald-500"}`} style={{width:`${Math.max(0,Math.min(100,robot.battery))}%`}}/></div>}<p className="mt-2 text-xs text-slate-500">{robot.batterySource === "SIMULATED" ? ui.simulatedChargeHelp : robot.batterySource === "SENSOR" ? robotCopy.streaming : ui.batteryUnavailable}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{ui.robotPosition}</p><p className="mt-1 text-lg font-bold text-slate-950">{robot.x.toFixed(2)}, {robot.y.toFixed(2)} m</p><p className="mt-2 text-xs text-slate-500">{ui.heading}: {robot.yaw.toFixed(2)} rad · {ui.lastSeen}: {formatDate(robot.lastSeen, locale)}</p></div>
        </div>
      </div>
      <div className={`border-t px-5 py-3 text-sm font-semibold ${robotConnected ? "border-emerald-100 bg-emerald-50 text-emerald-700" : "border-red-100 bg-red-50 text-red-700"}`}><span className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${robotConnected ? "bg-emerald-500" : "bg-red-500"}`}/>{robotConnected ? ui.telemetryFresh : ui.telemetryStale}</div>
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,.75fr)]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{ui.liveOperations}</p><h2 className="mt-1 text-lg font-bold text-slate-950">{copy.liveMap}</h2><p className="mt-1 text-sm text-slate-500">{copy.liveMapHelp}</p></div>
          <div className="flex gap-2"><StatusPill active={backendOnline} label={backendOnline ? copy.connected : copy.backendOffline}/><StatusPill active={Boolean(occupancyMap)} label={occupancyMap ? copy.mapAvailable : copy.waitingMap}/></div>
        </div>
        <div className="p-3 md:p-4"><RobotMap /></div>
      </section>

      <div className="space-y-6">
        <WorkflowControls />
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">{ui.currentMission}</h2>{activeTask && <StatusBadge status={activeTask.status}/>}</div>
          {activeTask ? <div className="mt-5 space-y-4"><div><p className="text-xl font-bold text-slate-950">{activeTask.id}</p><p className="mt-1 text-sm text-slate-500">{stationName(activeTask.pickupStationId)} → {stationName(activeTask.destinationStationId)}</p></div><div><div className="mb-2 flex justify-between text-xs font-semibold text-slate-500"><span>{copy.progress}</span><span>{missionProgress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-all" style={{width:`${missionProgress}%`}}/></div></div><NavigationMetrics feedback={navigationFeedback} taskId={activeTask.id} status={activeTask.status}/></div> : <div className="mt-5 rounded-2xl bg-slate-50 p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">✓</span><p className="mt-3 font-semibold text-slate-900">{ui.ready}</p><p className="mt-1 text-sm leading-6 text-slate-500">{ui.noCurrentMission}</p></div>}
        </section>
      </div>
    </div>

    <section className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="flex items-center justify-between gap-4"><div><h2 className="text-lg font-bold text-slate-950">{ui.recentActivity}</h2><p className="mt-1 text-sm text-slate-500">{copy.recentHelp}</p></div><Link href="/tasks" className="text-sm font-semibold text-blue-700">{ui.viewAllTasks} →</Link></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-3 py-3">{copy.task}</th><th className="px-3 py-3">{copy.pickup}</th><th className="px-3 py-3">{copy.destination}</th><th className="px-3 py-3">{copy.status}</th><th className="px-3 py-3">{copy.created}</th></tr></thead><tbody>{tasks.slice(0,6).map((task)=><tr key={task.id} className="border-b border-slate-100 last:border-0"><td className="px-3 py-4 font-semibold text-slate-950">{task.id}</td><td className="px-3 py-4 text-slate-600">{stationName(task.pickupStationId)}</td><td className="px-3 py-4 text-slate-600">{stationName(task.destinationStationId)}</td><td className="px-3 py-4"><StatusBadge status={task.status}/></td><td className="px-3 py-4 text-slate-500">{formatDate(task.createdAt,locale)}</td></tr>)}</tbody></table></div>
    </section>

    <details className="group mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 md:px-6 [&::-webkit-details-marker]:hidden">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{ui.sensorHealth}</p><h2 className="mt-1 text-lg font-bold text-slate-950">{ui.diagnosticsDetails}</h2><p className="mt-1 text-sm text-slate-500">{diagnosticIssues.length === 0 ? ui.allHealthy : ui.diagnosticsNeedAttention}</p></div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 transition group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="border-t border-slate-100 p-4 md:p-6"><DiagnosticsCards diagnostics={diagnostics}/></div>
    </details>

    <details className="group mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 md:px-6 [&::-webkit-details-marker]:hidden">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{ui.integrationHealth}</p><h2 className="mt-1 text-lg font-bold text-slate-950">{robotCopy.integration}</h2><p className="mt-1 text-sm text-slate-500">{ui.integrationDetailsHelp}</p></div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-600 transition group-open:rotate-180" aria-hidden="true">⌄</span>
      </summary>
      <div className="grid gap-3 border-t border-slate-100 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-3"><Integration name="Next.js → FastAPI" state={backendOnline ? robotCopy.connected : robotCopy.offline} active={backendOnline}/><Integration name="PostgreSQL" state={backendOnline ? ui.apiDatabaseReachable : robotCopy.unavailable} active={backendOnline}/><Integration name="ROS 2 Web Bridge" state={robotConnected ? robotCopy.connected : robotCopy.offline} active={robotConnected}/><Integration name={ui.poseTelemetry} state={localizationDiagnostic ? localizationDiagnostic.message : robotCopy.waiting} active={localizationDiagnostic?.level === "OK"}/><Integration name="Nav2" state={activeTask ? t("taskStatus")[activeTask.status] : ui.missionStandby} active={robotConnected}/><Integration name={ui.diagnosticsStream} state={diagnosticsFresh ? ui.telemetryFresh : ui.telemetryStale} active={diagnosticsFresh}/></div>
    </details>
  </>;
}

function OverviewCard({icon,label,value,detail,tone}:{icon:"robot"|"mission"|"queue"|"health";label:string;value:string;detail:string;tone:"emerald"|"red"|"blue"|"amber"|"violet"|"slate"}) {
  const styles={emerald:"bg-emerald-50 text-emerald-700",red:"bg-red-50 text-red-700",blue:"bg-blue-50 text-blue-700",amber:"bg-amber-50 text-amber-700",violet:"bg-violet-50 text-violet-700",slate:"bg-slate-100 text-slate-600"};
  return <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start gap-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${styles[tone]}`}><OverviewIcon name={icon}/></span><div className="min-w-0"><p className="text-sm font-semibold text-slate-500">{label}</p><p className="mt-1 truncate text-xl font-bold text-slate-950">{value}</p><p className="mt-2 truncate text-xs text-slate-500">{detail}</p></div></div></article>;
}

function StatusPill({active,label}:{active:boolean;label:string}) { return <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${active?"bg-emerald-500":"bg-red-500"}`}/>{label}</span>; }
function StatePill({active,label}:{active:boolean;label:string}) { return <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${active?"bg-emerald-100 text-emerald-700":"bg-red-100 text-red-700"}`}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${active?"bg-emerald-500":"bg-red-500"}`}/>{label}</span>; }
function SmallPill({label,value}:{label:string;value:string}) { return <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs"><span className="text-slate-500">{label}</span> <strong className="ml-1 text-slate-800">{value}</strong></span>; }
function Integration({name,state,active}:{name:string;state:string;active:boolean}) { return <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{name}</p><p className="mt-1 text-xs text-slate-500">{state}</p></div><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${active?"bg-emerald-500":"bg-amber-500"}`}/></div>; }
function useCurrentTime() { const [now,setNow]=useState(0); useEffect(()=>{ setNow(Date.now()); const timer=window.setInterval(()=>setNow(Date.now()),1000); return()=>window.clearInterval(timer); },[]); return now; }
function OverviewIcon({name}:{name:"robot"|"mission"|"queue"|"health"}) {
  const common="h-6 w-6";
  if(name==="robot") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M12 7V4M8 12h.01M16 12h.01M8 16h8" strokeLinecap="round"/></svg>;
  if(name==="mission") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="8"/><path d="m9 12 2 2 4-5"/></svg>;
  if(name==="queue") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round"/></svg>;
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 13h4l2-6 4 12 2-6h4"/><path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"/></svg>;
}
