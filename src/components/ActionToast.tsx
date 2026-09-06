"use client";

import { useEffect } from "react";

type ActionToastProps = {
  kind: "success" | "error";
  title: string;
  body: string;
  closeLabel: string;
  onClose: () => void;
  durationMs?: number;
};

export default function ActionToast({
  kind,
  title,
  body,
  closeLabel,
  onClose,
  durationMs = 7000,
}: ActionToastProps) {
  useEffect(() => {
    if (kind !== "success" || durationMs <= 0) return;
    const timeout = window.setTimeout(onClose, durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs, kind, onClose]);

  const success = kind === "success";
  return (
    <section
      role={success ? "status" : "alert"}
      aria-live={success ? "polite" : "assertive"}
      aria-atomic="true"
      className={`fixed inset-x-4 bottom-5 z-[90] mx-auto max-w-md overflow-hidden rounded-2xl border bg-white shadow-2xl sm:inset-x-auto sm:right-6 sm:mx-0 ${
        success ? "border-emerald-200" : "border-rose-200"
      }`}
    >
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className={`grid size-10 shrink-0 place-items-center rounded-full text-lg font-black ${
            success
              ? "bg-emerald-100 text-emerald-700"
              : "bg-rose-100 text-rose-700"
          }`}
        >
          {success ? "✓" : "!"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-slate-950">{title}</p>
          <p className="mt-1 text-sm leading-5 text-slate-600">{body}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="grid size-9 shrink-0 place-items-center rounded-lg text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          ×
        </button>
      </div>
      {success && (
        <div className="h-1 bg-emerald-100">
          <div className="h-full w-full origin-left animate-[toast-progress_7s_linear_forwards] bg-emerald-500" />
        </div>
      )}
    </section>
  );
}
