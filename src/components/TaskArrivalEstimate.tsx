import { buildTaskEtaDisplay, formatEtaDuration, type EtaValue } from "@/lib/taskEta";
import type { DeliveryTask, TaskEstimate } from "@/types";
import { useLocale } from "@/context/LocaleContext";
import { formatDate, operationalText } from "@/lib/i18n";

export default function TaskArrivalEstimate({
  task,
  estimate
}: {
  task: DeliveryTask;
  estimate?: TaskEstimate;
}) {
  const { locale } = useLocale();
  const copy = operationalText[locale];
  const display = buildTaskEtaDisplay(task, estimate);
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {display.queuePosition !== undefined && (
        <div className="rounded-lg bg-violet-50 p-3 sm:col-span-2">
          <p className="text-xs text-violet-700">{copy.queuePosition}</p>
          <p className="mt-1 font-bold text-violet-900">#{display.queuePosition}</p>
        </div>
      )}
      <EtaCard label={copy.pickupArrival} value={display.pickup} />
      <EtaCard label={copy.destinationArrival} value={display.destination} />
    </div>
  );
}

function EtaCard({ label, value }: { label: string; value: EtaValue }) {
  const { locale, t } = useLocale();
  const copy = operationalText[locale];
  const text = value.state === "estimate"
    ? `${formatEtaDuration(value.seconds)} · ${formatDate(value.arrivalAt, locale)}`
    : value.state === "arrived"
      ? copy.arrived
    : value.state === "picked-up"
        ? copy.pickedUp
    : value.state === "awaiting-confirmation"
          ? copy.awaitingConfirmation
    : value.state === "completed"
            ? t("taskStatus").COMPLETED
    : value.state === "calculating"
              ? copy.calculating : copy.unavailable;
  return <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-semibold text-slate-900">{text}</p></div>;
}
