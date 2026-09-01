"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import WorkflowControls from "@/components/WorkflowControls";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import * as api from "@/lib/api";
import { TaskHistoryEntry, TaskStatus } from "@/types";

const filters: Array<"ALL" | TaskStatus> = [
  "ALL",
  "QUEUED",
  "GOING_TO_PICKUP",
  "WAITING_FOR_LOADING",
  "DELIVERING",
  "WAITING_FOR_UNLOADING",
  "COMPLETED",
  "FAILED",
  "CANCELLED"
];

const cancellableStatuses: TaskStatus[] = [
  "QUEUED",
  "GOING_TO_PICKUP",
  "WAITING_FOR_LOADING",
  "DELIVERING",
  "WAITING_FOR_UNLOADING"
];

export default function TasksPage() {
  const { tasks, stationName, cancelTask, retryTask, backendOnline } = useDeliveryApi();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [message, setMessage] = useState("");
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [historyTaskId, setHistoryTaskId] = useState<string | null>(null);
  const [history, setHistory] = useState<TaskHistoryEntry[]>([]);

  const visibleTasks = useMemo(
    () => tasks.filter((task) => filter === "ALL" || task.status === filter),
    [filter, tasks]
  );

  async function runTaskAction(taskId: string, action: () => Promise<void>, success: string) {
    setBusyTaskId(taskId);
    setMessage("");
    try {
      await action();
      setMessage(success);
      if (historyTaskId === taskId) {
        setHistory(await api.getTaskHistory(taskId));
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Task action failed.");
    } finally {
      setBusyTaskId(null);
    }
  }

  async function loadHistory(taskId: string) {
    setBusyTaskId(taskId);
    setMessage("");
    try {
      const entries = await api.getTaskHistory(taskId);
      setHistoryTaskId(taskId);
      setHistory(entries);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to load task history.");
    } finally {
      setBusyTaskId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Task Queue"
        description="Validated delivery queue, retry and recovery controls, and persistent task history."
      />

      <WorkflowControls />

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setFilter(item)}
              className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                filter === item
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {item.replaceAll("_", " ")}
            </button>
          ))}
        </div>

        {message && (
          <p aria-live="polite" className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
            {message}
          </p>
        )}

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[1050px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">Task</th>
                <th className="px-3 py-3">Pickup</th>
                <th className="px-3 py-3">Destination</th>
                <th className="px-3 py-3">Robot</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Progress</th>
                <th className="px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-4 font-semibold text-slate-900">{task.id}</td>
                  <td className="px-3 py-4">{stationName(task.pickupStationId)}</td>
                  <td className="px-3 py-4">{stationName(task.destinationStationId)}</td>
                  <td className="px-3 py-4 text-slate-500">{task.robotId ?? "Unassigned"}</td>
                  <td className="px-3 py-4"><StatusBadge status={task.status} /></td>
                  <td className="px-3 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-blue-600 transition-all"
                          style={{ width: `${task.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-500">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={!backendOnline || busyTaskId === task.id}
                        onClick={() => void loadHistory(task.id)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        History
                      </button>

                      {cancellableStatuses.includes(task.status) && (
                        <button
                          type="button"
                          disabled={!backendOnline || busyTaskId === task.id}
                          onClick={() => void runTaskAction(
                            task.id,
                            () => cancelTask(task.id),
                            `${task.id} cancelled. Queue dispatch was re-evaluated.`
                          )}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}

                      {task.status === "FAILED" && (
                        <button
                          type="button"
                          disabled={!backendOnline || busyTaskId === task.id}
                          onClick={() => void runTaskAction(
                            task.id,
                            () => retryTask(task.id),
                            `${task.id} returned to the queue and was dispatched if the robot was available.`
                          )}
                          className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >
                          Retry
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleTasks.length === 0 && (
            <div className="py-12 text-center text-sm text-slate-500">No tasks match this filter.</div>
          )}
        </div>
      </section>

      {historyTaskId && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-900">{historyTaskId} Event History</h2>
              <p className="text-sm text-slate-500">Persistent audit trail stored in PostgreSQL.</p>
            </div>
            <button
              type="button"
              onClick={() => { setHistoryTaskId(null); setHistory([]); }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600"
            >
              Close
            </button>
          </div>

          <div className="mt-5 space-y-3">
            {history.map((entry) => (
              <div key={entry.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-slate-900">{entry.eventType.replaceAll("_", " ")}</p>
                  <span className="text-xs text-slate-400">{new Date(entry.createdAt).toLocaleString()}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {entry.fromStatus ? `${entry.fromStatus.replaceAll("_", " ")} → ` : ""}
                  {entry.toStatus.replaceAll("_", " ")}
                </p>
                <p className="mt-1 text-xs text-slate-400">Source: {entry.source}</p>
                {entry.detail && <p className="mt-2 text-xs text-slate-500">{entry.detail}</p>}
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
