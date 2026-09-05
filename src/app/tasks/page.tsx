"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import TaskArrivalEstimate from "@/components/TaskArrivalEstimate";
import TaskHistoryModal from "@/components/TaskHistoryModal";
import TaskMetadata from "@/components/TaskMetadata";
import WorkflowControls from "@/components/WorkflowControls";
import { useAuth } from "@/context/AuthContext";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import * as api from "@/lib/api";
import { formatDate, tasksText } from "@/lib/i18n";
import { ACTIVE_TASK_STATUSES } from "@/lib/roleDashboard";
import { displayedTaskProgress } from "@/lib/taskProgress";
import type { DeliveryTask, TaskHistoryEntry, TaskStatus } from "@/types";

const filters: Array<"ALL" | TaskStatus> = ["ALL", "QUEUED", "GOING_TO_PICKUP", "WAITING_FOR_LOADING", "DELIVERING", "WAITING_FOR_UNLOADING", "COMPLETED", "FAILED", "CANCELLED"];
const cancellableStatuses: TaskStatus[] = ["QUEUED", "GOING_TO_PICKUP", "WAITING_FOR_LOADING", "DELIVERING", "WAITING_FOR_UNLOADING"];
const PAGE_SIZE = 20;

export default function TasksPage() {
  const { user } = useAuth();
  const { locale, format, t } = useLocale();
  const copy = tasksText[locale];
  const { tasks, stationName, cancelTask, retryTask, backendOnline, taskEstimates, navigationFeedback } = useDeliveryApi();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [selectedTaskId, setSelectedTaskId] = useState<string>();
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [busyTaskId, setBusyTaskId] = useState<string>();
  const [message, setMessage] = useState("");
  const [drawerMessage, setDrawerMessage] = useState("");
  const [pageTasks, setPageTasks] = useState<DeliveryTask[]>([]);
  const [pageTotal, setPageTotal] = useState(0);
  const [pageOffset, setPageOffset] = useState(0);
  const [pageLoading, setPageLoading] = useState(true);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [remoteTask, setRemoteTask] = useState<DeliveryTask>();
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const historyOpenRef = useRef(false);
  const selectedTask = pageTasks.find((task) => task.id === selectedTaskId) ?? tasks.find((task) => task.id === selectedTaskId) ?? (remoteTask?.id === selectedTaskId ? remoteTask : undefined);
  const drawerTaskId = selectedTask?.id;
  const taskEstimateById = useMemo(() => new Map(taskEstimates.map((estimate) => [estimate.taskId, estimate])), [taskEstimates]);
  const historyTaskStatus = selectedTask?.id === historyTaskId ? selectedTask.status : tasks.find((task) => task.id === historyTaskId)?.status;
  const taskRevision = useMemo(() => tasks.map((task) => `${task.id}:${task.status}:${task.progress}`).join("|"), [tasks]);

  const loadPage = useCallback(async () => {
    setPageLoading(true);
    try {
      const page = await api.getTaskPage({status: filter === "ALL" ? undefined : filter, query, offset: pageOffset, limit: PAGE_SIZE});
      setPageTasks(page.items); setPageTotal(page.total); setMessage("");
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : copy.loadFailed);
    } finally { setPageLoading(false); }
  }, [copy.loadFailed, filter, pageOffset, query]);

  useEffect(() => { void loadPage(); }, [loadPage, taskRevision]);

  const closeDrawer = useCallback(() => {
    setSelectedTaskId(undefined); setRemoteTask(undefined); setDrawerMessage("");
    const url = new URL(window.location.href); url.searchParams.delete("task");
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  const openDrawer = useCallback((taskId: string, trigger?: HTMLElement | null) => {
    returnFocusRef.current = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setSelectedTaskId(taskId); setDrawerMessage("");
    const url = new URL(window.location.href); url.searchParams.set("task", taskId);
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
  }, []);

  useEffect(() => {
    const taskId = new URLSearchParams(window.location.search).get("task");
    if (taskId) openDrawer(taskId, null);
  }, [openDrawer]);

  useEffect(() => {
    if (!selectedTaskId || selectedTask) return;
    let cancelled = false;
    api.getTask(selectedTaskId).then((task) => { if (!cancelled) setRemoteTask(task); }).catch((reason) => { if (!cancelled) { setMessage(reason instanceof Error ? reason.message : copy.loadFailed); closeDrawer(); } });
    return () => { cancelled = true; };
  }, [closeDrawer, copy.loadFailed, selectedTask, selectedTaskId]);

  useEffect(() => { historyOpenRef.current = Boolean(historyTaskId); }, [historyTaskId]);

  useEffect(() => {
    if (!drawerTaskId) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = returnFocusRef.current;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const handleKeyDown = (event: KeyboardEvent) => {
      if (historyOpenRef.current) return;
      if (event.key === "Escape") { event.preventDefault(); closeDrawer(); return; }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKeyDown); previousFocus?.focus(); };
  }, [closeDrawer, drawerTaskId]);

  useEffect(() => {
    if (!historyTaskId) return;
    let cancelled = false;
    setHistoryLoading(true);
    api.getTaskHistory(historyTaskId)
      .then((entries) => { if (!cancelled) setHistory(entries); })
      .catch((reason) => { if (!cancelled) setMessage(reason instanceof Error ? reason.message : copy.historyLoadFailed); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [copy.historyLoadFailed, historyTaskId, historyTaskStatus]);

  const closeHistory = useCallback(() => { setHistoryTaskId(null); setHistory([]); }, []);

  async function runTaskAction(task: DeliveryTask, action: () => Promise<void>, success: string) {
    setBusyTaskId(task.id); setDrawerMessage("");
    try { await action(); setDrawerMessage(success); await loadPage(); }
    catch (reason) { setDrawerMessage(reason instanceof Error ? reason.message : copy.taskActionFailed); }
    finally { setBusyTaskId(undefined); }
  }

  function submitSearch(event: FormEvent) { event.preventDefault(); setPageOffset(0); setQuery(searchInput.trim()); }

  function changeFilter(next: (typeof filters)[number]) { setFilter(next); setPageOffset(0); }

  return <>
    <PageHeader title={user?.role === "ADMIN" ? copy.allTitle : copy.myTitle} description={user?.role === "ADMIN" ? copy.allDescription : copy.myDescription} />
    {user?.role === "ADMIN" && <div className="mt-6"><WorkflowControls /></div>}
    <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <header className="border-b border-slate-100 p-4 md:p-5">
        <form onSubmit={submitSearch} className="mb-4 flex gap-2"><label className="sr-only" htmlFor="task-search">{copy.search}</label><input id="task-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder={copy.searchPlaceholder} className="min-h-11 min-w-0 flex-1 rounded-xl border border-slate-200 px-4 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/><button type="submit" className="min-h-11 rounded-xl bg-slate-900 px-4 text-sm font-bold text-white">{copy.search}</button></form>
        <div className="flex gap-2 overflow-x-auto pb-1" aria-label={copy.statusFilter}>{filters.map((item) => <button key={item} type="button" onClick={() => changeFilter(item)} aria-pressed={filter === item} className={`min-h-10 shrink-0 rounded-xl px-3 py-2 text-xs font-bold transition ${filter === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{item === "ALL" ? t("allActions") : t("taskStatus")[item]}</button>)}</div>
        {message && <p aria-live="polite" className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</p>}
      </header>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/70 text-xs uppercase tracking-wide text-slate-400"><tr><th className="px-5 py-3">{copy.task}</th><th className="px-5 py-3">{copy.route}</th><th className="px-5 py-3">{copy.status}</th><th className="px-5 py-3">{copy.owner}</th><th className="px-5 py-3">{copy.created}</th><th className="px-5 py-3 text-right">{copy.details}</th></tr></thead>
          <tbody>{pageTasks.map((task) => <tr key={task.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60"><td className="px-5 py-4 font-bold text-slate-950">{task.id}</td><td className="px-5 py-4 text-slate-600">{stationName(task.pickupStationId)} → {stationName(task.destinationStationId)}</td><td className="px-5 py-4"><StatusBadge status={task.status} /></td><td className="px-5 py-4 text-slate-600">{task.ownerUsername ?? (task.ownerId ? copy.account : copy.system)}</td><td className="px-5 py-4 text-slate-500">{formatDate(task.createdAt, locale)}</td><td className="px-5 py-4 text-right"><button type="button" onClick={(event) => openDrawer(task.id, event.currentTarget)} className="min-h-10 rounded-lg px-3 py-2 font-bold text-blue-700 hover:bg-blue-50">{copy.openDetails} →</button></td></tr>)}</tbody>
        </table>
      </div>
      <ul className="divide-y divide-slate-100 md:hidden">{pageTasks.map((task) => <li key={task.id} className="p-4"><button type="button" onClick={(event) => openDrawer(task.id, event.currentTarget)} className="w-full text-left"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{task.id}</p><p className="mt-1 text-sm text-slate-600">{stationName(task.pickupStationId)} → {stationName(task.destinationStationId)}</p></div><StatusBadge status={task.status} /></div><div className="mt-3 flex items-center justify-between text-xs text-slate-400"><span>{task.ownerUsername ?? copy.account}</span><span>{formatDate(task.createdAt, locale)}</span></div></button></li>)}</ul>
      {pageLoading && <div aria-live="polite" className="px-5 py-10 text-center text-sm text-slate-500">{copy.loading}</div>}
      {!pageLoading && pageTasks.length === 0 && <div className="px-5 py-14 text-center text-sm text-slate-500">{copy.noMatch}</div>}
      {pageTotal > 0 && <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-4"><p className="text-sm text-slate-500">{copy.results.replace("{start}", String(pageOffset + 1)).replace("{end}", String(Math.min(pageOffset + PAGE_SIZE, pageTotal))).replace("{total}", String(pageTotal))}</p><div className="flex gap-2"><button type="button" disabled={pageOffset === 0 || pageLoading} onClick={() => setPageOffset(Math.max(0, pageOffset - PAGE_SIZE))} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold disabled:opacity-40">{copy.previous}</button><button type="button" disabled={pageOffset + PAGE_SIZE >= pageTotal || pageLoading} onClick={() => setPageOffset(pageOffset + PAGE_SIZE)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-bold disabled:opacity-40">{copy.next}</button></div></footer>}
    </section>

    {selectedTask && <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/35 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeDrawer(); }}><aside ref={drawerRef} role="dialog" aria-modal="true" aria-labelledby="task-details-title" aria-describedby={drawerMessage ? "task-drawer-feedback" : undefined} className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-blue-600">{copy.deliveryDetails}</p><h2 id="task-details-title" className="mt-1 text-2xl font-bold text-slate-950">{selectedTask.id}</h2><p className="mt-1 text-sm text-slate-500">{stationName(selectedTask.pickupStationId)} → {stationName(selectedTask.destinationStationId)}</p></div><button ref={closeButtonRef} type="button" onClick={closeDrawer} aria-label={copy.closeDetails} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-xl text-slate-600">×</button></header>
      {drawerMessage && <p id="task-drawer-feedback" role="status" aria-live="polite" className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">{drawerMessage}</p>}
      <div className="mt-5 flex flex-wrap items-center gap-2"><StatusBadge status={selectedTask.status} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{copy.owner}: {selectedTask.ownerUsername ?? (selectedTask.ownerId ? copy.account : copy.system)}</span></div>
      {ACTIVE_TASK_STATUSES.includes(selectedTask.status) && <div className="mt-5"><div className="mb-2 flex justify-between text-xs font-semibold text-slate-500"><span>{copy.progress}</span><span>{displayedTaskProgress(selectedTask, navigationFeedback)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600" style={{ width: `${displayedTaskProgress(selectedTask, navigationFeedback)}%` }} /></div></div>}
      <section className="mt-5 rounded-2xl border border-slate-200 p-4"><h3 className="font-bold text-slate-900">{copy.details}</h3><div className="mt-3"><TaskMetadata task={selectedTask} /></div><dl className="mt-4 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{copy.robot}</dt><dd className="mt-1 font-semibold text-slate-900">{selectedTask.robotId ?? copy.unassigned}</dd></div><div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{copy.created}</dt><dd className="mt-1 font-semibold text-slate-900">{formatDate(selectedTask.createdAt, locale)}</dd></div></dl></section>
      <section className="mt-5"><h3 className="mb-3 font-bold text-slate-900">{copy.estimate}</h3><TaskArrivalEstimate task={selectedTask} estimate={taskEstimateById.get(selectedTask.id)} /></section>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5"><button type="button" onClick={() => setHistoryTaskId(selectedTask.id)} className="min-h-11 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700">{copy.history}</button>{cancellableStatuses.includes(selectedTask.status) && <button type="button" disabled={!backendOnline || busyTaskId === selectedTask.id} onClick={() => void runTaskAction(selectedTask, () => cancelTask(selectedTask.id), format(copy.cancelled, { id: selectedTask.id }))} className="min-h-11 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 disabled:opacity-50">{copy.cancel}</button>}{selectedTask.status === "FAILED" && <button type="button" disabled={!backendOnline || busyTaskId === selectedTask.id} onClick={() => void runTaskAction(selectedTask, () => retryTask(selectedTask.id), format(copy.returned, { id: selectedTask.id }))} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{copy.retry}</button>}</div>
    </aside></div>}
    <TaskHistoryModal taskId={historyTaskId} entries={history} loading={historyLoading} onClose={closeHistory} />
  </>;
}
