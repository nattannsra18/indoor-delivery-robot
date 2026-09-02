import {
  NavigationFeedback,
  TaskStatus
} from "@/types";

type NavigationMetricsProps = {
  feedback?: NavigationFeedback;
  taskId: string;
  status: TaskStatus;
};

const NAVIGATING_STATUSES: TaskStatus[] = [
  "GOING_TO_PICKUP",
  "DELIVERING"
];

export default function NavigationMetrics({
  feedback,
  taskId,
  status
}: NavigationMetricsProps) {
  if (!NAVIGATING_STATUSES.includes(status)) {
    return null;
  }

  const currentFeedback =
    feedback?.taskId === taskId
      ? feedback
      : undefined;

  if (!currentFeedback) {
    return (
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
        <p className="text-sm font-semibold text-blue-900">
          Live navigation
        </p>
        <p className="mt-1 text-sm text-blue-700">
          Waiting for Nav2 feedback...
        </p>
      </div>
    );
  }

  const updatedAt = formatTime(
    currentFeedback.serverTime
  );

  return (
    <section
      aria-live="polite"
      className="rounded-xl border border-blue-100 bg-blue-50/60 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-blue-950">
            Live navigation
          </p>
          <p className="mt-0.5 text-xs text-blue-700">
            {currentFeedback.stage === "pickup"
              ? "Pickup route"
              : "Destination route"}
          </p>
        </div>

        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
          Updated {updatedAt}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <NavigationMetric
          label="Distance remaining"
          value={
            `${currentFeedback.distanceRemaining.toFixed(2)} m`
          }
        />

        <NavigationMetric
          label="Estimated arrival"
          value={formatDuration(
            currentFeedback
              .estimatedTimeRemainingSeconds
          )}
        />

        <NavigationMetric
          label="Navigation time"
          value={formatDuration(
            currentFeedback.navigationTimeSeconds
          )}
        />

        <NavigationMetric
          label="Recoveries"
          value={String(
            currentFeedback.numberOfRecoveries
          )}
        />

        <NavigationMetric
          label="Linear speed"
          value={
            currentFeedback.linearVelocity
              === undefined
              ? "—"
              : (
                  `${currentFeedback
                    .linearVelocity
                    .toFixed(2)} m/s`
                )
          }
        />

        <NavigationMetric
          label="Angular velocity"
          value={
            currentFeedback.angularVelocity
              === undefined
              ? "—"
              : (
                  `${currentFeedback
                    .angularVelocity
                    .toFixed(2)} rad/s`
                )
          }
        />
        
      </div>
    </section>
  );
}

function NavigationMetric({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-blue-100 bg-white p-3">
      <p className="text-xs text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function formatDuration(
  value: number | undefined
): string {
  if (
    value === undefined
    || !Number.isFinite(value)
  ) {
    return "—";
  }

  const totalSeconds = Math.max(
    0,
    Math.round(value)
  );
  const minutes = Math.floor(
    totalSeconds / 60
  );
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function formatTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "just now";
  }

  return date.toLocaleTimeString(
    [],
    {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }
  );
}