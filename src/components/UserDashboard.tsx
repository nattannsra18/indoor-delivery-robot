"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import NavigationMetrics from "@/components/NavigationMetrics";
import PageHeader from "@/components/PageHeader";
import RobotMap from "@/components/RobotMap";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import {
  ACTIVE_TASK_STATUSES,
  classifyMyDeliveries,
  formatTaskTimestamp
} from "@/lib/roleDashboard";
import { userDashboardText } from "@/lib/i18n";
import type { DeliveryTask, RobotState, TaskEstimate } from "@/types";

export default function UserDashboard() {
  const { locale, format } = useLocale();
  const { user } = useAuth();
  const copy = userDashboardText[locale];
  const {
    tasks, navigationFeedback, stationName, loading, backendOnline, error,
    taskEstimates, globalQueuedCount, robotAvailableSeconds, robot, occupancyMap
  } = useDeliveryApi();
  const estimateByTaskId = new Map(
    taskEstimates.map((estimate) => [estimate.taskId, estimate])
  );
  const { active, pending } = classifyMyDeliveries(tasks);
  const queuedWithEstimates = pending
    .map((task) => ({ task, estimate: estimateByTaskId.get(task.id) }))
    .sort((left, right) =>
      (left.estimate?.queuePosition ?? Number.MAX_SAFE_INTEGER)
      - (right.estimate?.queuePosition ?? Number.MAX_SAFE_INTEGER)
    );
  const nextOwnedTask = queuedWithEstimates[0];
  const recentTasks = [...tasks]
    .filter((task) => task.status !== "QUEUED")
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, 6);

  const rawWaitSeconds = nextOwnedTask?.estimate?.startEtaSeconds
    ?? (pending.length === 0 ? robotAvailableSeconds : undefined);
  const waitSeconds = useCountdownSeconds(rawWaitSeconds);

  if (loading) {
    return <><PageHeader title={welcomeTitle(locale, user?.username)} description={copy.description} /><StatePanel title={copy.loading} detail={copy.loadingDetail} /></>;
  }
  if (!backendOnline) {
    return <><PageHeader title={welcomeTitle(locale, user?.username)} description={copy.description} /><StatePanel title={copy.loadError} detail={error ?? copy.offline} /></>;
  }

  const waitValue = formatApproximateDuration(waitSeconds, locale);

  return (
    <div className="user-dashboard">
      <PageHeader title={welcomeTitle(locale, user?.username)} description={copy.description} />

      <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4" aria-label={copy.summary}>
        <SummaryCard icon="delivery" accent="blue" label={copy.activeDelivery} value={active ? "1" : "0"} note={active ? active.id : copy.noActiveShort} />
        <SummaryCard icon="queue" accent="violet" label={copy.queuePosition} value={nextOwnedTask?.estimate?.queuePosition ? `#${nextOwnedTask.estimate.queuePosition}` : "0"} note={nextOwnedTask ? queuePositionNote(nextOwnedTask.task.id, pending.length, locale) : copy.noPending} />
        <SummaryCard icon="wait" accent="orange" label={copy.estimatedWaitTime} value={waitValue} note={nextOwnedTask ? format(copy.yourTurnIn, { time: waitValue }) : copy.untilRobotAvailable} footer={format(copy.tasksInQueue, { count: globalQueuedCount })} />
        <SummaryCard icon="robot" accent="emerald" label={copy.robotStatus} value={robotStateLabel(robot.state, locale)} note={robot.online ? copy.robotOnline : copy.robotOffline} />
      </section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.75fr)]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-bold text-slate-950">{copy.liveMap}</h2><p className="mt-1 text-sm text-slate-500">{copy.liveMapHelp}</p></div>
            <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${robot.online && occupancyMap ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              ● {robot.online && occupancyMap ? copy.live : copy.waitingForMap}
            </span>
          </div>
          <RobotMap smoothMotion />
        </section>
        <div className="grid content-start gap-6">
          <CurrentRobotTask task={active} />
          <QueuePreview queued={queuedWithEstimates} globalQueuedCount={globalQueuedCount} stationName={stationName} />
          <QuickActions />
        </div>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-lg font-bold text-slate-950">{copy.recent}</h2><p className="mt-1 text-sm text-slate-500">{copy.recentDetail}</p></div>
          <Link href="/tasks" className="text-sm font-semibold text-blue-700 hover:text-blue-800">{copy.viewTasks} →</Link>
        </div>
        {recentTasks.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{copy.noRecent}</p> : (
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 text-xs text-slate-500"><tr>
              <th className="rounded-l-lg px-3 py-2.5 font-medium">{copy.task}</th><th className="px-3 py-2.5 font-medium">{copy.route}</th><th className="px-3 py-2.5 font-medium">{copy.status}</th><th className="px-3 py-2.5 font-medium">{copy.time}</th><th className="rounded-r-lg px-3 py-2.5 font-medium">{copy.duration}</th>
            </tr></thead>
            <tbody>{recentTasks.map((task) => <RecentDeliveryRow key={task.id} task={task} stationName={stationName} />)}</tbody>
          </table></div>
        )}
      </section>

    </div>
  );
}

type SummaryIconName = "delivery" | "queue" | "wait" | "robot";

function SummaryCard({ icon, accent, label, value, note, footer }: { icon: SummaryIconName; accent: "blue" | "violet" | "orange" | "emerald"; label: string; value: string; note: string; footer?: string }) {
  const colors = { blue: "border-blue-100 bg-blue-50 text-blue-700", violet: "border-violet-100 bg-violet-50 text-violet-700", orange: "border-orange-100 bg-orange-50 text-orange-700", emerald: "border-emerald-100 bg-emerald-50 text-emerald-700" };
  return <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex items-start gap-3">
    <span aria-hidden="true" className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl border ${colors[accent]}`}><SummaryIcon name={icon} /></span>
    <div className="min-w-0"><p className="text-sm font-semibold text-slate-600">{label}</p><p className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs leading-5 text-slate-500">{note}</p>{footer && <p className="mt-2 text-xs font-medium text-slate-600">{footer}</p>}</div>
  </div></article>;
}

function SummaryIcon({ name }: { name: SummaryIconName }) {
  const common = "h-6 w-6 fill-none stroke-current";
  if (name === "delivery") return <svg viewBox="0 0 24 24" className={common} strokeWidth="1.9"><path d="M8.5 6V4.8A1.8 1.8 0 0 1 10.3 3h3.4a1.8 1.8 0 0 1 1.8 1.8V6M7 5.75h10a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.75a2 2 0 0 1 2-2Zm2.5 0h5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (name === "queue") return <svg viewBox="0 0 24 24" className={common} strokeWidth="1.9"><path d="M9 7h10M9 12h10M9 17h10" strokeLinecap="round" /><circle cx="5" cy="7" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="5" cy="17" r="1" fill="currentColor" stroke="none" /></svg>;
  if (name === "wait") return <svg viewBox="0 0 24 24" className={common} strokeWidth="1.9"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  return <svg viewBox="0 0 24 24" className={common} strokeWidth="1.8"><path d="M12 4V2.75M9.5 4h5A4.5 4.5 0 0 1 19 8.5v6a4.5 4.5 0 0 1-4.5 4.5h-5A4.5 4.5 0 0 1 5 14.5v-6A4.5 4.5 0 0 1 9.5 4ZM5 10H3v4h2m14-4h2v4h-2M9 14.5h6" strokeLinecap="round" strokeLinejoin="round" /><circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" /></svg>;
}

function CurrentRobotTask({ task }: { task?: DeliveryTask }) {
  const { locale, t } = useLocale();
  const copy = userDashboardText[locale];
  const {
    robot, navigationFeedback, stationName, advanceRobotWorkflow, backendOnline
  } = useDeliveryApi();
  const [confirming, setConfirming] = useState(false);
  const [confirmationError, setConfirmationError] = useState("");
  const confirmLabel = task?.status === "WAITING_FOR_LOADING"
    ? t("confirmLoaded")
    : task?.status === "WAITING_FOR_UNLOADING"
      ? t("confirmReceived")
      : undefined;

  async function confirmWorkflow() {
    setConfirming(true);
    setConfirmationError("");
    try {
      await advanceRobotWorkflow();
    } catch (error) {
      setConfirmationError(error instanceof Error ? error.message : t("actionFailed"));
    } finally {
      setConfirming(false);
    }
  }

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">{copy.currentRobotTask}</h2>{task && <StatusBadge status={task.status} />}</div>
    {task ? <div className="mt-4 space-y-4">
      <div><p className="font-bold text-slate-950">{task.id}</p><p className="mt-1 text-sm text-slate-600">{stationName(task.pickupStationId)} → {stationName(task.destinationStationId)}</p></div>
      <Progress task={task} /><NavigationMetrics feedback={navigationFeedback} taskId={task.id} status={task.status} />
      {confirmLabel && <div>
        <button type="button" onClick={() => void confirmWorkflow()} disabled={confirming || !backendOnline || !robot.online} className="min-h-11 w-full rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
          {confirming ? t("processing") : confirmLabel}
        </button>
        <p className="mt-2 text-xs leading-5 text-slate-500">{task.status === "WAITING_FOR_LOADING" ? t("confirmLoadedHelp") : t("confirmReceivedHelp")}</p>
      </div>}
      {confirmationError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{confirmationError}</p>}
    </div> : <div className="mt-4 rounded-xl bg-slate-50 p-4">
      <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${robot.online ? "bg-emerald-500" : "bg-slate-400"}`} /><p className="font-semibold text-slate-900">{robotStateLabel(robot.state, locale)}</p></div>
      <p className="mt-2 text-sm leading-6 text-slate-600">{robot.state !== "IDLE" && robot.state !== "OFFLINE" ? copy.robotServingAnotherTask : copy.noCurrentTask}</p>
    </div>}
  </section>;
}

function QueuePreview({ queued, globalQueuedCount, stationName }: { queued: Array<{ task: DeliveryTask; estimate?: TaskEstimate }>; globalQueuedCount: number; stationName: (stationId: string) => string }) {
  const { locale, format } = useLocale();
  const copy = userDashboardText[locale];
  const visibleQueued = queued.slice(0, 2);
  const remainingOwnedCount = Math.max(0, queued.length - visibleQueued.length);
  const privateQueueCount = Math.max(0, globalQueuedCount - queued.length);
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">{copy.nextInQueue}</h2><span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{format(copy.taskCount, { count: globalQueuedCount })}</span></div>
    {queued.length > 0 ? <div className="mt-3">
      <div className="divide-y divide-slate-100">{visibleQueued.map(({ task, estimate }) => <div key={task.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-full border border-blue-200 text-xs font-bold text-blue-700">{estimate?.queuePosition ?? "—"}</span>
        <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{task.id}</p><p className="truncate text-xs text-slate-500">{stationName(task.pickupStationId)} → {stationName(task.destinationStationId)}</p></div>
        <span className="text-xs font-semibold text-slate-600">{formatApproximateDuration(estimate?.startEtaSeconds, locale)}</span>
      </div>)}</div>
      {remainingOwnedCount > 0 && <Link href="/tasks" className="mt-2 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100">
        <span>{locale === "th" ? `+${remainingOwnedCount} งานของคุณในคิว` : `+${remainingOwnedCount} more of your tasks`}</span><span aria-hidden="true">→</span>
      </Link>}
      {privateQueueCount > 0 && <p className="mt-2 text-xs leading-5 text-slate-500">
        {locale === "th" ? `มีงานของผู้ใช้อื่นอีก ${privateQueueCount} งาน โดยซ่อนรายละเอียดไว้` : `${privateQueueCount} other queued tasks have private details.`}
      </p>}
    </div> : <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{globalQueuedCount > 0 ? format(copy.privateQueueSummary, { count: globalQueuedCount }) : copy.queueEmpty}</p>}
  </section>;
}

function QuickActions() {
  const { locale } = useLocale();
  const copy = userDashboardText[locale];
  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <h2 className="text-lg font-bold text-slate-950">{locale === "th" ? "ทางลัด" : "Quick Actions"}</h2>
    <div className="mt-3 grid gap-3">
      <Link href="/delivery" className="flex min-h-14 items-center gap-3 rounded-xl bg-blue-600 px-4 py-3 text-white shadow-sm transition hover:bg-blue-700">
        <span aria-hidden="true" className="text-2xl">＋</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{copy.createDelivery}</span><span className="mt-0.5 block text-xs text-blue-100">{locale === "th" ? "ส่งคำขอจัดส่งใหม่" : "Send a new delivery request"}</span></span>
        <span aria-hidden="true">›</span>
      </Link>
      <Link href="/tasks" className="flex min-h-14 items-center gap-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-blue-800 transition hover:border-blue-200 hover:bg-blue-100">
        <span aria-hidden="true" className="text-xl">≡</span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{copy.viewTasks}</span><span className="mt-0.5 block text-xs text-blue-700">{locale === "th" ? "ติดตามงานจัดส่งล่าสุดของคุณ" : "Track your recent deliveries"}</span></span>
        <span aria-hidden="true">›</span>
      </Link>
    </div>
  </section>;
}

function RecentDeliveryRow({ task, stationName }: { task: DeliveryTask; stationName: (stationId: string) => string }) {
  const { locale } = useLocale();
  return <tr className="border-b border-slate-100 last:border-0">
    <td className="px-3 py-3 font-semibold text-slate-900">{task.id}{ACTIVE_TASK_STATUSES.includes(task.status) && <div className="mt-2 max-w-32"><Progress task={task} compact /></div>}</td>
    <td className="px-3 py-3 text-slate-600">{stationName(task.pickupStationId)} → {stationName(task.destinationStationId)}</td><td className="px-3 py-3"><StatusBadge status={task.status} /></td><td className="px-3 py-3 text-slate-500">{formatTaskTimestamp(task.createdAt, locale)}</td><td className="px-3 py-3 font-medium text-slate-600">{formatTaskDuration(task, locale)}</td>
  </tr>;
}

function Progress({ task, compact = false }: { task: DeliveryTask; compact?: boolean }) {
  const { locale } = useLocale();
  const copy = userDashboardText[locale];
  if (!ACTIVE_TASK_STATUSES.includes(task.status)) return null;
  return <div>{!compact && <div className="mb-2 flex justify-between text-xs text-slate-500"><span>{copy.progress}</span><span>{task.progress}%</span></div>}<div className={`${compact ? "h-1.5" : "h-2"} overflow-hidden rounded-full bg-slate-100`}><div className="h-full rounded-full bg-blue-600 transition-[width] duration-700 ease-out" style={{ width: `${task.progress}%` }} /></div></div>;
}

function StatePanel({ title, detail }: { title: string; detail: string }) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-600">{detail}</p></section>;
}

function formatApproximateDuration(value: number | undefined, locale: "en" | "th") {
  if (value === undefined || !Number.isFinite(value)) return "—";
  const minutes = Math.max(0, Math.ceil(value / 60));
  if (minutes < 1) return locale === "th" ? "< 1 นาที" : "< 1 min";
  return locale === "th" ? `~ ${minutes} นาที` : `~ ${minutes} min`;
}

function queuePositionNote(taskId: string, ownedQueueCount: number, locale: "en" | "th") {
  const remaining = Math.max(0, ownedQueueCount - 1);
  if (remaining === 0) return taskId;
  return locale === "th"
    ? `${taskId} · มีงานของคุณต่ออีก ${remaining} งาน`
    : `${taskId} · ${remaining} more of your tasks queued`;
}

function useCountdownSeconds(value: number | undefined) {
  const [remaining, setRemaining] = useState(value);

  useEffect(() => {
    setRemaining(value);
  }, [value]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining((current) => current === undefined ? undefined : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return remaining;
}

function welcomeTitle(locale: "en" | "th", username?: string) {
  return locale === "th"
    ? `ยินดีต้อนรับกลับมา ${username ?? ""}!`
    : `Welcome back, ${username ?? ""}!`;
}

function formatTaskDuration(task: DeliveryTask, locale: "en" | "th") {
  if (!task.completedAt) return "—";
  const start = Date.parse(task.startedAt ?? task.createdAt);
  const end = Date.parse(task.completedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return "—";
  const seconds = Math.round((end - start) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return locale === "th" ? `${minutes} นาที ${remainder} วินาที` : `${minutes}m ${remainder}s`;
}

function robotStateLabel(state: RobotState, locale: "en" | "th") {
  const labels: Record<RobotState, [string, string]> = {
    IDLE: ["Idle", "ว่าง"], GOING_TO_PICKUP: ["Going to pickup", "กำลังไปจุดรับ"], WAITING_FOR_LOADING: ["Waiting for loading", "รอการโหลด"], DELIVERING: ["Delivering", "กำลังจัดส่ง"], WAITING_FOR_UNLOADING: ["Waiting for unloading", "รอการนำพัสดุออก"], ERROR: ["Needs attention", "ต้องตรวจสอบ"], OFFLINE: ["Offline", "ออฟไลน์"]
  };
  return labels[state][locale === "th" ? 1 : 0];
}
