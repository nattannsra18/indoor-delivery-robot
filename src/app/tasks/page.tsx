"use client";

import { useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import WorkflowControls from "@/components/WorkflowControls";
import { useMockDelivery } from "@/context/MockDeliveryContext";
import { TaskStatus } from "@/types";

const filters: Array<"ALL" | TaskStatus> = [
  "ALL",
  "QUEUED",
  "GOING_TO_PICKUP",
  "WAITING_FOR_LOADING",
  "DELIVERING",
  "WAITING_FOR_UNLOADING",
  "COMPLETED",
  "CANCELLED"
];

export default function TasksPage() {
  const { tasks, stationName, cancelTask } = useMockDelivery();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");

  const visibleTasks = useMemo(
    () => tasks.filter((task) => filter === "ALL" || task.status === filter),
    [filter, tasks]
  );

  return (
    <>
      <PageHeader title="Task Queue" description="Follow each task through the complete pickup and delivery state machine." />

      <WorkflowControls />

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {filters.map((item) => (
            <button key={item} type="button" onClick={() => setFilter(item)} className={`min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition ${filter === item ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {item.replaceAll("_", " ")}
            </button>
          ))}
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">Task</th>
                <th className="px-3 py-3">Pickup</th>
                <th className="px-3 py-3">Destination</th>
                <th className="px-3 py-3">Robot</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Progress</th>
                <th className="px-3 py-3">Action</th>
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
                        <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${task.progress}%` }} />
                      </div>
                      <span className="text-xs text-slate-500">{task.progress}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-4">
                    {task.status === "QUEUED" ? (
                      <button type="button" onClick={() => cancelTask(task.id)} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Cancel</button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {visibleTasks.length === 0 && <div className="py-12 text-center text-sm text-slate-500">No tasks match this filter.</div>}
        </div>
      </section>
    </>
  );
}
