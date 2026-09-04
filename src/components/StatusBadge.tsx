"use client";
import { TaskStatus } from "@/types";
import { useLocale } from "@/context/LocaleContext";

const styles: Record<TaskStatus, string> = {
  QUEUED: "bg-slate-100 text-slate-700",
  GOING_TO_PICKUP: "bg-cyan-50 text-cyan-700",
  WAITING_FOR_LOADING: "bg-amber-50 text-amber-700",
  DELIVERING: "bg-blue-50 text-blue-700",
  WAITING_FOR_UNLOADING: "bg-violet-50 text-violet-700",
  COMPLETED: "bg-emerald-50 text-emerald-700",
  FAILED: "bg-red-50 text-red-700",
  CANCELLED: "bg-slate-100 text-slate-500"
};

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const { t } = useLocale();
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${styles[status]}`}>
      {t("taskStatus")[status]}
    </span>
  );
}
