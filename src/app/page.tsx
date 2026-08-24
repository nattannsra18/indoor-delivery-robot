"use client";

import PageHeader from "@/components/PageHeader";
import RobotMapMock from "@/components/RobotMapMock";
import StatusBadge from "@/components/StatusBadge";
import WorkflowControls from "@/components/WorkflowControls";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";

export default function DashboardPage() {
  const { robot, activeTask, queuedTasks, tasks, stationName, backendOnline } = useDeliveryApi();

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Phase 2.1 dashboard connected to the FastAPI backend."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Robot"
          value={robot.online ? "ONLINE" : "OFFLINE"}
          note={robot.name}
          accent="emerald"
        />
        <MetricCard
          label="Battery"
          value={`${robot.battery}%`}
          note="FastAPI data"
          accent="blue"
        />
        <MetricCard
          label="Robot State"
          value={robot.state.replaceAll("_", " ")}
          note="Loaded from backend"
          accent="amber"
        />
        <MetricCard
          label="Task Queue"
          value={`${queuedTasks.length} waiting`}
          note={activeTask ? `${activeTask.id} active` : "No active task"}
          accent="violet"
        />
      </div>

      <div className="mt-6">
        <WorkflowControls />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">Live Robot Map</h2>
              <p className="text-sm text-slate-500">Frontend visualization using backend robot/task data</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${backendOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              ● {backendOnline ? "FastAPI Connected" : "Backend Offline"}
            </span>
          </div>
          <RobotMapMock />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Current Delivery</h2>
          {activeTask ? (
            <div className="mt-5 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">{activeTask.id}</span>
                <StatusBadge status={activeTask.status} />
              </div>

              <RouteRow label="Pickup" value={stationName(activeTask.pickupStationId)} />
              <RouteRow label="Destination" value={stationName(activeTask.destinationStationId)} />

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Mission progress</span>
                  <span className="font-semibold text-slate-900">{activeTask.progress}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${activeTask.progress}%` }}
                  />
                </div>
              </div>

              <MissionMessage status={activeTask.status} />
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              Robot is IDLE. Create a delivery request; FastAPI will assign it automatically.
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold text-slate-900">Recent Tasks</h2>
          <p className="text-sm text-slate-500">Task data is refreshed from FastAPI every 2 seconds and after each action.</p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">Task</th>
                <th className="px-3 py-3">Pickup</th>
                <th className="px-3 py-3">Destination</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0, 6).map((task) => (
                <tr key={task.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-4 font-semibold text-slate-900">{task.id}</td>
                  <td className="px-3 py-4">{stationName(task.pickupStationId)}</td>
                  <td className="px-3 py-4">{stationName(task.destinationStationId)}</td>
                  <td className="px-3 py-4"><StatusBadge status={task.status} /></td>
                  <td className="px-3 py-4 text-slate-500">{task.createdAt}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function MetricCard({
  label,
  value,
  note,
  accent
}: {
  label: string;
  value: string;
  note: string;
  accent: "emerald" | "blue" | "amber" | "violet";
}) {
  const colors = {
    emerald: "bg-emerald-500",
    blue: "bg-blue-500",
    amber: "bg-amber-500",
    violet: "bg-violet-500"
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 h-1.5 w-10 rounded-full ${colors[accent]}`} />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function RouteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">{value}</span>
    </div>
  );
}

function MissionMessage({ status }: { status: string }) {
  const content: Record<string, { title: string; description: string; style: string }> = {
    GOING_TO_PICKUP: {
      title: "Going to pickup station",
      description: "In the real system, Nav2 will navigate to the pickup goal.",
      style: "border-cyan-100 bg-cyan-50 text-cyan-800"
    },
    WAITING_FOR_LOADING: {
      title: "Waiting for package loading",
      description: "Sender loads the package, then presses the physical CONFIRM button on the robot.",
      style: "border-amber-100 bg-amber-50 text-amber-800"
    },
    DELIVERING: {
      title: "Delivering package",
      description: "Nav2 will navigate from pickup to the destination station.",
      style: "border-blue-100 bg-blue-50 text-blue-800"
    },
    WAITING_FOR_UNLOADING: {
      title: "Waiting for package pickup",
      description: "Receiver removes the package and presses the same physical CONFIRM button.",
      style: "border-violet-100 bg-violet-50 text-violet-800"
    }
  };

  const item = content[status];
  if (!item) return null;

  return (
    <div className={`rounded-xl border p-4 ${item.style}`}>
      <p className="text-sm font-semibold">{item.title}</p>
      <p className="mt-1 text-xs leading-5">{item.description}</p>
    </div>
  );
}
