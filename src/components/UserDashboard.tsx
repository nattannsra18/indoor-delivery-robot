"use client";

import Link from "next/link";
import NavigationMetrics from "@/components/NavigationMetrics";
import PageHeader from "@/components/PageHeader";
import StatusBadge from "@/components/StatusBadge";
import WorkflowControls from "@/components/WorkflowControls";
import TaskArrivalEstimate from "@/components/TaskArrivalEstimate";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import {
  classifyMyDeliveries,
  formatTaskTimestamp,
  myDeliveriesViewState
} from "@/lib/roleDashboard";
import type { ReactNode } from "react";
import type { DeliveryTask } from "@/types";

export default function UserDashboard() {
  const {
    tasks,
    navigationFeedback,
    stationName,
    loading,
    backendOnline,
    error,
    taskEstimates
  } = useDeliveryApi();
  const estimateByTaskId = new Map(
    taskEstimates.map((estimate) => [estimate.taskId, estimate])
  );
  const { active, pending, recent } = classifyMyDeliveries(tasks);
  const viewState = myDeliveriesViewState(
    loading,
    backendOnline,
    tasks.length
  );

  return (
    <>
      <PageHeader
        title="My Deliveries"
        description="Track your active delivery and review your recent delivery requests."
      />

      {viewState === "loading" && (
        <StatePanel title="Loading your deliveries…" detail="Fetching your task status from FastAPI." />
      )}

      {viewState === "empty" && (
        <StatePanel
          title="No deliveries yet"
          detail="Create your first delivery request to start tracking it here."
          action={<Link href="/delivery" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Create Delivery</Link>}
        />
      )}

      {viewState === "error" && (
        <StatePanel
          title="Unable to load your deliveries"
          detail={error ?? "FastAPI is currently unavailable."}
        />
      )}

      {viewState === "ready" && (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">My active delivery</p>
                <h2 className="mt-1 font-semibold text-slate-900">Current progress</h2>
              </div>
              <Link href="/tasks" className="text-sm font-semibold text-blue-700">View My Tasks</Link>
            </div>
            {active ? (
              <div className="mt-5 space-y-5">
                <DeliverySummary task={active} stationName={stationName} />
                <NavigationMetrics
                  feedback={navigationFeedback}
                  taskId={active.id}
                  status={active.status}
                />
                <TaskArrivalEstimate
                  task={active}
                  estimate={estimateByTaskId.get(active.id)}
                />
                <WorkflowControls />
              </div>
            ) : (
              <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
                You have no delivery in progress. A queued request will appear here when assigned.
              </p>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Pending deliveries</h2>
            <p className="mt-1 text-sm text-slate-500">Your delivery requests waiting to be assigned.</p>
            {pending.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No pending deliveries.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {pending.map((task) => (
                  <div key={task.id} className="rounded-xl border border-slate-200 p-4">
                    <DeliverySummary task={task} stationName={stationName} />
                    <div className="mt-4">
                      <TaskArrivalEstimate
                        task={task}
                        estimate={estimateByTaskId.get(task.id)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Recent deliveries</h2>
            <p className="mt-1 text-sm text-slate-500">Your newest completed, failed and cancelled deliveries.</p>
            {recent.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No recent deliveries.</p>
            ) : (
              <div className="mt-4 grid gap-3">
                {recent.slice(0, 6).map((task) => (
                  <DeliverySummary key={task.id} task={task} stationName={stationName} compact />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}

function DeliverySummary({
  task,
  stationName,
  compact = false
}: {
  task: DeliveryTask;
  stationName: (stationId: string) => string;
  compact?: boolean;
}) {
  return (
    <article className={compact ? "rounded-xl border border-slate-200 p-4" : "space-y-4"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">{task.id}</p>
          <p className="mt-1 text-xs text-slate-500">{formatTaskTimestamp(task.createdAt)}</p>
        </div>
        <StatusBadge status={task.status} />
      </div>
      <div className={`grid gap-3 ${compact ? "mt-4 sm:grid-cols-2" : "sm:grid-cols-2"}`}>
        <Route label="Pickup" value={stationName(task.pickupStationId)} />
        <Route label="Destination" value={stationName(task.destinationStationId)} />
      </div>
      <div className={compact ? "mt-4" : ""}>
        <div className="mb-2 flex justify-between text-xs text-slate-500">
          <span>Progress</span><span>{task.progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-blue-600" style={{ width: `${task.progress}%` }} />
        </div>
      </div>
    </article>
  );
}

function Route({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{value}</p></div>;
}

function StatePanel({
  title,
  detail,
  action
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="font-semibold text-slate-900">{title}</h2><p className="mt-2 text-sm text-slate-600">{detail}</p>{action && <div className="mt-4">{action}</div>}</section>;
}
