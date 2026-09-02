"use client";

import { useEffect } from "react";
import TaskTimeline from "@/components/TaskTimeline";
import { TaskHistoryEntry } from "@/types";

type TaskHistoryModalProps = {
  taskId: string | null;
  entries: TaskHistoryEntry[];
  loading: boolean;
  onClose: () => void;
};

export default function TaskHistoryModal({
  taskId,
  entries,
  loading,
  onClose
}: TaskHistoryModalProps) {
  useEffect(() => {
    if (!taskId) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = "hidden";

    const handleKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      window.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [taskId, onClose]);

  if (!taskId) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="task-history-title"
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
          <div>
            <h2
              id="task-history-title"
              className="font-semibold text-slate-900"
            >
              {taskId} Event History
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Task timeline and stage durations
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Close
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center">
              <div className="text-center">
                <span className="mx-auto block h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-blue-600" />
                <p className="mt-3 text-sm text-slate-500">
                  Loading task history...
                </p>
              </div>
            </div>
          ) : (
            <TaskTimeline entries={entries} />
          )}
        </div>
      </section>
    </div>
  );
}