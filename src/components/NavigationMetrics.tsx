import {
  NavigationFeedback,
  TaskStatus
} from "@/types";
import { useEffect, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { operationalText } from "@/lib/i18n";

type NavigationMetricsProps = {
  feedback?: NavigationFeedback;
  taskId?: string;
  status?: TaskStatus;
  compact?: boolean;
  layout?: "wide" | "rail";
};

const NAVIGATING_STATUSES: TaskStatus[] = [
  "GOING_TO_PICKUP",
  "DELIVERING"
];

export default function NavigationMetrics({
  feedback,
  taskId,
  status,
  compact = false,
  layout = "wide"
}: NavigationMetricsProps) {
  const { locale, format } = useLocale();
  const copy = operationalText[locale];
  const currentFeedback =
    taskId && feedback?.taskId === taskId
      ? feedback
      : undefined;
  const countdownEta = useSecondCountdown(
    currentFeedback?.estimatedTimeRemainingSeconds
  );
  const elapsedNavigationTime = useSecondCountUp(
    currentFeedback?.navigationTimeSeconds
  );

  if (!status || !NAVIGATING_STATUSES.includes(status)) {
    return (
      <section className={`rounded-xl border border-blue-100 bg-blue-50/60 ${compact ? "p-3" : "p-4"}`}>
        <p className="text-sm font-semibold text-blue-950">{copy.liveNavigation}</p>
        <NavigationMetricsGrid
          compact={compact}
          layout={layout}
          copy={copy}
          values={IDLE_VALUES}
        />
      </section>
    );
  }

  if (!currentFeedback) {
    return (
      <div className={`rounded-xl border border-blue-100 bg-blue-50 ${compact ? "p-3" : "p-4"}`}>
        <p className="text-sm font-semibold text-blue-900">
          {copy.liveNavigation}
        </p>
        <p className="mt-1 text-sm text-blue-700">
          {copy.waitingFeedback}
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
      className={`rounded-xl border border-blue-100 bg-blue-50/60 ${compact ? "p-3" : "p-4"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-blue-950">
            {copy.liveNavigation}
          </p>
          <p className="mt-0.5 text-xs text-blue-700">
            {currentFeedback.stage === "pickup"
              ? copy.pickupRoute : copy.destinationRoute}
          </p>
        </div>

        <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {format(copy.updated, { time: updatedAt })}
        </span>
      </div>

      <NavigationMetricsGrid compact={compact} layout={layout} copy={copy} values={{
        distance: `${currentFeedback.distanceRemaining.toFixed(2)} m`,
        eta: formatDuration(countdownEta),
        navigationTime: formatDuration(elapsedNavigationTime),
        recoveries: String(currentFeedback.numberOfRecoveries),
        linearSpeed: currentFeedback.linearVelocity === undefined ? "—" : `${currentFeedback.linearVelocity.toFixed(2)} m/s`,
        angularVelocity: currentFeedback.angularVelocity === undefined ? "—" : `${currentFeedback.angularVelocity.toFixed(2)} rad/s`
      }} />
    </section>
  );
}

const IDLE_VALUES = {
  distance: "0 m",
  eta: "0s",
  navigationTime: "0s",
  recoveries: "0",
  linearSpeed: "0 m/s",
  angularVelocity: "0 rad/s"
};

function NavigationMetricsGrid({
  compact,
  layout,
  copy,
  values
}: {
  compact: boolean;
  layout: "wide" | "rail";
  copy: Record<string, string>;
  values?: {
    distance: string;
    eta: string;
    navigationTime: string;
    recoveries: string;
    linearSpeed: string;
    angularVelocity: string;
  };
}) {
  return (
    <div className={`${compact ? `mt-3 overflow-hidden rounded-xl border border-blue-100 bg-blue-100 grid-cols-2 gap-px ${layout === "wide" ? "sm:grid-cols-3 xl:grid-cols-6" : ""}` : "mt-4 grid-cols-2 gap-3"} grid`}>
      <NavigationMetric compact={compact} label={copy.distance} value={values?.distance} />
      <NavigationMetric compact={compact} label={copy.estimatedArrival} value={values?.eta} />
      <NavigationMetric compact={compact} label={copy.navigationTime} value={values?.navigationTime} />
      <NavigationMetric compact={compact} label={copy.recoveries} value={values?.recoveries} />
      <NavigationMetric compact={compact} label={copy.linearSpeed} value={values?.linearSpeed} />
      <NavigationMetric compact={compact} label={copy.angularVelocity} value={values?.angularVelocity} />
    </div>
  );
}

function useSecondCountdown(value: number | undefined) {
  const [remaining, setRemaining] = useState(value);

  useEffect(() => {
    setRemaining(value);
  }, [value]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemaining((current) => current === undefined
        ? undefined
        : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return remaining;
}

function useSecondCountUp(value: number | undefined) {
  const [elapsed, setElapsed] = useState(value);

  useEffect(() => {
    setElapsed(value);
  }, [value]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsed((current) => current === undefined
        ? undefined
        : current + 1);
    }, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return elapsed;
}

function NavigationMetric({
  label,
  value,
  compact = false
}: {
  label: string;
  value?: string;
  compact?: boolean;
}) {
  return (
    <div className={compact ? "min-w-0 bg-white p-2.5" : "rounded-lg border border-blue-100 bg-white p-3"}>
      <p className="text-xs text-slate-500">
        {label}
      </p>
      {value && <p className={`mt-1 font-bold text-slate-900 ${compact ? "text-base" : "text-lg"}`}>{value}</p>}
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
