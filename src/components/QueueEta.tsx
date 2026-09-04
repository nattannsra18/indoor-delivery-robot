import { QueueEstimate } from "@/lib/queueEta";
import { useLocale } from "@/context/LocaleContext";
import { operationalText } from "@/lib/i18n";

type QueueEtaProps = {
  estimate?: QueueEstimate;
  active: boolean;
};

export default function QueueEta({
  estimate,
  active
}: QueueEtaProps) {
  const { locale, format } = useLocale();
  const copy = operationalText[locale];
  if (active) {
    return (
      <div>
        <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
          {copy.activeNow}
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
        {format(copy.queue, { position: estimate.position })}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {format(copy.starts, { time: formatRelativeTime(estimate.startsInSeconds, locale) })}
      </p>

      <p className="mt-0.5 text-xs text-slate-500">
        {format(copy.completes, { time: formatRelativeTime(estimate.completesInSeconds, locale) })}
      </p>
    </div>
  );
}

function formatRelativeTime(
  seconds: number, locale: "en" | "th"
): string {
  if (
    !Number.isFinite(seconds)
    || seconds <= 0
  ) {
    return locale === "th" ? "ตอนนี้" : "now";
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
    return locale === "th" ? `ในอีกประมาณ ${hours} ชม. ${minutes} นาที` : `in ~${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return (
      locale === "th" ? `ในอีกประมาณ ${minutes} นาที ${remainingSeconds} วินาที` : `in ~${minutes}m ${remainingSeconds}s`
    );
  }

  return locale === "th" ? `ในอีกประมาณ ${remainingSeconds} วินาที` : `in ~${remainingSeconds}s`;
}
