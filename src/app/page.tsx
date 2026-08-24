import PageHeader from "@/components/PageHeader";
import RobotMapMock from "@/components/RobotMapMock";
import StatusBadge from "@/components/StatusBadge";
import { robots, stationName, tasks } from "@/lib/mock-data";

export default function DashboardPage() {
  const robot = robots[0];
  const currentTask = tasks.find((task) => task.id === robot.currentTaskId);

  return (
    <>
      <PageHeader title="Dashboard" description="Real-time overview of the delivery robot and active mission." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Robot" value={robot.online ? "ONLINE" : "OFFLINE"} note={robot.name} accent="emerald" />
        <MetricCard label="Battery" value={`${robot.battery}%`} note="Estimated healthy" accent="blue" />
        <MetricCard label="Robot State" value={robot.state.replaceAll("_", " ")} note="Updated just now" accent="amber" />
        <MetricCard label="Current Task" value={robot.currentTaskId ?? "None"} note="1 active / 2 queued" accent="violet" />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">Live Robot Map</h2>
              <p className="text-sm text-slate-500">Mock localization and planned path</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">● Connected</span>
          </div>
          <RobotMapMock />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Current Delivery</h2>
          {currentTask ? (
            <div className="mt-5 space-y-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">{currentTask.id}</span>
                <StatusBadge status={currentTask.status} />
              </div>
              <RouteRow label="Pickup" value={stationName(currentTask.pickupStationId)} />
              <RouteRow label="Destination" value={stationName(currentTask.destinationStationId)} />
              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">Mission progress</span>
                  <span className="font-semibold text-slate-900">{currentTask.progress}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${currentTask.progress}%` }} />
                </div>
              </div>
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-900">Robot is delivering</p>
                <p className="mt-1 text-xs leading-5 text-blue-700">Nav2 is moving the robot toward the destination station. This is simulated in Phase 1.</p>
              </div>
            </div>
          ) : <p className="mt-4 text-sm text-slate-500">No active delivery.</p>}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold text-slate-900">Recent Tasks</h2>
          <p className="text-sm text-slate-500">Latest mock delivery activities</p>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="px-3 py-3">Task</th><th className="px-3 py-3">Pickup</th><th className="px-3 py-3">Destination</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Created</th></tr>
            </thead>
            <tbody>
              {tasks.slice(0, 4).map((task) => (
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

function MetricCard({ label, value, note, accent }: { label:string; value:string; note:string; accent:"emerald"|"blue"|"amber"|"violet" }) {
  const colors = { emerald:"bg-emerald-500", blue:"bg-blue-500", amber:"bg-amber-500", violet:"bg-violet-500" };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 h-1.5 w-10 rounded-full ${colors[accent]}`} />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xl font-bold text-slate-900">{value}</p>
      <p className="mt-2 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function RouteRow({ label, value }: { label:string; value:string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4"><span className="text-sm text-slate-500">{label}</span><span className="text-right text-sm font-semibold text-slate-900">{value}</span></div>;
}
