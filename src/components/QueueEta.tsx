import { QueueEstimate } from "@/lib/queueEta";

type QueueEtaProps = {
  estimate?: QueueEstimate;
  active: boolean;
};

export default function QueueEta({
  estimate,
  active
}: QueueEtaProps) {
  if (active) {
    return (
      <div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          Active now
        </span>
      </div>
    );
  }

  if (!estimate) {
    return (
      <span className="text-sm text-slate-400">
        —
      </span>
    );
  }

  return (
    <div className="min-w-36">
      <p className="text-xs font-semibold text-slate-900">
        #{estimate.position} in queue
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Starts{" "}
        {formatRelativeTime(
          estimate.startsInSeconds
        )}
      </p>

      <p className="mt-0.5 text-xs text-slate-500">
        Completes{" "}
        {formatRelativeTime(
          estimate.completesInSeconds
        )}
      </p>
    </div>
  );
}

function formatRelativeTime(
  seconds: number
): string {
  if (
    !Number.isFinite(seconds)
    || seconds <= 0
  ) {
    return "now";
  }

  const roundedSeconds = Math.max(
    0,
    Math.round(seconds)
  );
  const hours = Math.floor(
    roundedSeconds / 3600
  );
  const minutes = Math.floor(
    (roundedSeconds % 3600) / 60
  );
  const remainingSeconds =
    roundedSeconds % 60;

  if (hours > 0) {
    return `in ~${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return (
      `in ~${minutes}m `
      + `${remainingSeconds}s`
    );
  }

  return `in ~${remainingSeconds}s`;
}