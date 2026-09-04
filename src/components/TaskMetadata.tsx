"use client";
import type { DeliveryTask, TaskPriority } from "@/types";
import { useLocale } from "@/context/LocaleContext";

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const { locale } = useLocale();
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
      priority === "HIGH"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-100 text-slate-600"
    }`}>
      {priority === "HIGH" ? locale === "th" ? "งานด่วน" : "High priority" : locale === "th" ? "งานปกติ" : "Normal priority"}
    </span>
  );
}

export default function TaskMetadata({ task }: { task: DeliveryTask }) {
  const { locale } = useLocale();
  return (
    <div className="space-y-2 text-xs text-slate-600">
      <PriorityBadge priority={task.priority} />
      {task.recipientName && (
        <p><span className="font-semibold text-slate-700">{locale === "th" ? "ผู้รับ:" : "Recipient:"}</span> {task.recipientName}</p>
      )}
      {task.deliveryNote && (
        <p className="max-w-sm whitespace-pre-wrap break-words">
          <span className="font-semibold text-slate-700">{locale === "th" ? "หมายเหตุ:" : "Note:"}</span> {task.deliveryNote}
        </p>
      )}
    </div>
  );
}
