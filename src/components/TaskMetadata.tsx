import type { DeliveryTask, TaskPriority } from "@/types";

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
      priority === "HIGH"
        ? "bg-rose-100 text-rose-700"
        : "bg-slate-100 text-slate-600"
    }`}>
      {priority === "HIGH" ? "High priority" : "Normal priority"}
    </span>
  );
}

export default function TaskMetadata({ task }: { task: DeliveryTask }) {
  return (
    <div className="space-y-2 text-xs text-slate-600">
      <PriorityBadge priority={task.priority} />
      {task.recipientName && (
        <p><span className="font-semibold text-slate-700">Recipient:</span> {task.recipientName}</p>
      )}
      {task.deliveryNote && (
        <p className="max-w-sm whitespace-pre-wrap break-words">
          <span className="font-semibold text-slate-700">Note:</span> {task.deliveryNote}
        </p>
      )}
    </div>
  );
}
