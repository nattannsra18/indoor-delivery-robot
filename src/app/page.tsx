"use client";

import PageHeader from "@/components/PageHeader";
import DiagnosticsCards from "@/components/DiagnosticsCards";
import RobotMap from "@/components/RobotMap";
import StatusBadge from "@/components/StatusBadge";
import WorkflowControls from "@/components/WorkflowControls";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import NavigationMetrics from "@/components/NavigationMetrics";
import EmergencyStopControl from "@/components/EmergencyStopControl";
import UserDashboard from "@/components/UserDashboard";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { dashboardText, formatDate } from "@/lib/i18n";
import { taskStatusCounts } from "@/lib/roleDashboard";

export default function DashboardPage() {
  const { user } = useAuth();
  const { locale, format } = useLocale();
  const copy = dashboardText[locale];
  const {
    occupancyMap,
    navigationFeedback,
    diagnostics,
    robot,
    activeTask,
    tasks,
    stationName,
    backendOnline
  } = useDeliveryApi();
  const counts = taskStatusCounts(tasks);

  if (user?.role === "USER") return <UserDashboard />;

  return (
    <>
      <PageHeader
        title={copy.title}
        description={copy.description}
      />

      <EmergencyStopControl />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={copy.robot}
          value={robot.online ? "ONLINE" : "OFFLINE"}
          note={robot.name}
          accent="emerald"
        />
        <MetricCard
          label={copy.battery}
          value={`${robot.battery}%`}
          note={copy.telemetry}
          accent="blue"
        />
        <MetricCard
          label={copy.robotState}
          value={robot.state.replaceAll("_", " ")}
          note={copy.loadedBackend}
          accent="amber"
        />
        <MetricCard
          label={copy.activeTasks}
          value={String(counts.active)}
          note={activeTask ? format(copy.active, { id: activeTask.id }) : copy.noActive}
          accent="violet"
        />
        <MetricCard label={copy.queued} value={String(counts.queued)} note={copy.waitingDispatch} accent="amber" />
        <MetricCard label={copy.failed} value={String(counts.failed)} note={copy.requiresAttention} accent="amber" />
        <MetricCard label={copy.completed} value={String(counts.completed)} note={copy.persisted} accent="emerald" />
      </div>

      <div className="mt-6">
        <WorkflowControls />
      </div>

      <div className="mt-6">
        <DiagnosticsCards diagnostics={diagnostics} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold text-slate-900">
                {copy.liveMap}
              </h2>
              <p className="text-sm text-slate-500">
                {copy.liveMapHelp}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ConnectionBadge
                active={backendOnline}
                activeLabel={copy.connected}
                inactiveLabel={copy.backendOffline}
              />
              <ConnectionBadge
                active={Boolean(occupancyMap)}
                activeLabel={copy.mapAvailable}
                inactiveLabel={copy.waitingMap}
              />
            </div>
          </div>
          <RobotMap />
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">
            {copy.currentDelivery}
          </h2>
          {activeTask ? (
            <div className="mt-5 space-y-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-900">
                  {activeTask.id}
                </span>
                <StatusBadge status={activeTask.status} />
              </div>

              <RouteRow
                label={copy.pickup}
                value={stationName(activeTask.pickupStationId)}
              />
              <RouteRow
                label={copy.destination}
                value={stationName(
                  activeTask.destinationStationId
                )}
              />

              <div>
                <div className="mb-2 flex justify-between text-sm">
                  <span className="text-slate-500">
                    {copy.progress}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {activeTask.progress}%
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-600 transition-all"
                    style={{ width: `${activeTask.progress}%` }}
                  />
                </div>
              </div>

              <NavigationMetrics
                feedback={navigationFeedback}
                taskId={activeTask.id}
                status={activeTask.status}
              />

              <MissionMessage status={activeTask.status} copy={copy} />
            </div>
          ) : (
            <div className="mt-5 rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">
              {copy.idleHelp}
            </div>
          )}
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="font-semibold text-slate-900">
            {copy.recentTasks}
          </h2>
          <p className="text-sm text-slate-500">
            {copy.recentHelp}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-3">{copy.task}</th>
                <th className="px-3 py-3">{copy.pickup}</th>
                <th className="px-3 py-3">{copy.destination}</th>
                <th className="px-3 py-3">{copy.status}</th>
                <th className="px-3 py-3">{copy.created}</th>
              </tr>
            </thead>
            <tbody>
              {tasks.slice(0, 6).map((task) => (
                <tr
                  key={task.id}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-4 font-semibold text-slate-900">
                    {task.id}
                  </td>
                  <td className="px-3 py-4">
                    {stationName(task.pickupStationId)}
                  </td>
                  <td className="px-3 py-4">
                    {stationName(task.destinationStationId)}
                  </td>
                  <td className="px-3 py-4">
                    <StatusBadge status={task.status} />
                  </td>
                  <td className="px-3 py-4 text-slate-500">
                    {formatDate(task.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ConnectionBadge({
  active,
  activeLabel,
  inactiveLabel
}: {
  active: boolean;
  activeLabel: string;
  inactiveLabel: string;
}) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      ● {active ? activeLabel : inactiveLabel}
    </span>
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
      <div
        className={`mb-4 h-1.5 w-10 rounded-full ${colors[accent]}`}
      />
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 break-words text-xl font-bold text-slate-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-slate-400">{note}</p>
    </div>
  );
}

function RouteRow({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-4">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-900">
        {value}
      </span>
    </div>
  );
}

function MissionMessage({ status, copy }: { status: string; copy: Record<string, string> }) {
  const content: Record<
    string,
    {
      title: string;
      description: string;
      style: string;
    }
  > = {
    GOING_TO_PICKUP: {
      title: copy.goingTitle, description: copy.goingHelp,
      style: "border-cyan-100 bg-cyan-50 text-cyan-800"
    },
    WAITING_FOR_LOADING: {
      title: copy.loadingTitle, description: copy.loadingHelp,
      style: "border-amber-100 bg-amber-50 text-amber-800"
    },
    DELIVERING: {
      title: copy.deliveringTitle, description: copy.deliveringHelp,
      style: "border-blue-100 bg-blue-50 text-blue-800"
    },
    WAITING_FOR_UNLOADING: {
      title: copy.unloadingTitle, description: copy.unloadingHelp,
      style: "border-violet-100 bg-violet-50 text-violet-800"
    }
  };

  const message = content[status];
  if (!message) return null;

  return (
    <div className={`rounded-xl border p-4 ${message.style}`}>
      <p className="text-sm font-semibold">{message.title}</p>
      <p className="mt-1 text-sm leading-6">
        {message.description}
      </p>
    </div>
  );
}
