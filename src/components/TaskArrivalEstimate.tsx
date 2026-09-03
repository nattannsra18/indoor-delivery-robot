import { formatTaskTimestamp } from "@/lib/roleDashboard";
import { buildTaskEtaDisplay, formatEtaDuration, type EtaValue } from "@/lib/taskEta";
import type { DeliveryTask, TaskEstimate } from "@/types";

export default function TaskArrivalEstimate({
  task,
  estimate
}: {
  task: DeliveryTask;
  estimate?: TaskEstimate;
}) {
  const display = buildTaskEtaDisplay(task, estimate);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {display.queuePosition !== undefined && (
        <div className="rounded-lg bg-violet-50 p-3 sm:col-span-2">
          <p className="text-xs text-violet-700">Queue position</p>
          <p className="mt-1 font-bold text-violet-900">#{display.queuePosition}</p>
        </div>
      )}
      <EtaCard label="Estimated pickup arrival" value={display.pickup} />
      <EtaCard label="Estimated destination arrival" value={display.destination} />
    </div>
  );
}

function EtaCard({ label, value }: { label: string; value: EtaValue }) {
  const text = value.state === "estimate"
    ? `${formatEtaDuration(value.seconds)} · ${formatTaskTimestamp(value.arrivalAt)}`
    : value.state === "arrived"
      ? "Arrived"
      : value.state === "picked-up"
        ? "Picked up"
        : value.state === "awaiting-confirmation"
          ? "Arrived · Awaiting receiver confirmation"
          : value.state === "completed"
            ? "Completed"
            : value.state === "calculating"
              ? "Calculating…"
              : "Unavailable";
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{text}</p></div>;
}
