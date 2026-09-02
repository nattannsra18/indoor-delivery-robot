"use client";

import {
  useEffect,
  useMemo,
  useState
} from "react";
import {
  TaskHistoryEntry,
  TaskStatus
} from "@/types";

const TERMINAL_STATUSES = new Set<TaskStatus>([
  "COMPLETED",
  "FAILED",
  "CANCELLED"
]);

const STATUS_STYLES: Record<TaskStatus, string> = {
  QUEUED: "border-slate-300 bg-slate-100 text-slate-700",
  GOING_TO_PICKUP:
    "border-cyan-300 bg-cyan-100 text-cyan-700",
  WAITING_FOR_LOADING:
    "border-amber-300 bg-amber-100 text-amber-700",
  DELIVERING:
    "border-blue-300 bg-blue-100 text-blue-700",
  WAITING_FOR_UNLOADING:
    "border-violet-300 bg-violet-100 text-violet-700",
  COMPLETED:
    "border-emerald-300 bg-emerald-100 text-emerald-700",
  FAILED:
    "border-red-300 bg-red-100 text-red-700",
  CANCELLED:
    "border-slate-400 bg-slate-200 text-slate-700"
};

export default function TaskTimeline({
  entries
}: {
  entries: TaskHistoryEntry[];
}) {
  const [now, setNow] = useState(
    () => Date.now()
  );

  useEffect(() => {
    const interval = window.setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => window.clearInterval(interval);
  }, []);

  const orderedEntries = useMemo(
    () =>
      [...entries].sort((left, right) => {
        const timeDifference =
          parseTime(left.createdAt)
          - parseTime(right.createdAt);

        return timeDifference || left.id - right.id;
      }),
    [entries]
  );

  if (orderedEntries.length === 0) {
    return (
      <div className="rounded-xl bg-slate-50 p-5 text-sm text-slate-500">
        No task events have been recorded.
      </div>
    );
  }

  const firstEntry = orderedEntries[0];
  const lastEntry =
    orderedEntries[orderedEntries.length - 1];

  const firstTime = parseTime(
    firstEntry.createdAt
  );
  const lastTime = parseTime(
    lastEntry.createdAt
  );
  const isTerminal = TERMINAL_STATUSES.has(
    lastEntry.toStatus
  );

  const totalDuration = durationBetween(
    firstTime,
    isTerminal ? lastTime : now
  );

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Current status"
          value={humanize(lastEntry.toStatus)}
        />
        <SummaryCard
          label="Total elapsed"
          value={formatDuration(totalDuration)}
        />
        <SummaryCard
          label="Recorded events"
          value={String(orderedEntries.length)}
        />
      </div>

      <div className="mt-6">
        {orderedEntries.map((entry, index) => {
          const nextEntry =
            orderedEntries[index + 1];
          const entryTime = parseTime(
            entry.createdAt
          );

          const stageDuration =
            TERMINAL_STATUSES.has(entry.toStatus)
              ? undefined
              : durationBetween(
                  entryTime,
                  nextEntry
                    ? parseTime(nextEntry.createdAt)
                    : now
                );

          const isCurrent =
            index === orderedEntries.length - 1
            && !isTerminal;

          return (
            <article
              key={entry.id}
              className="relative grid grid-cols-[24px_1fr] gap-4 pb-6 last:pb-0"
            >
              <div className="relative flex justify-center">
                {index < orderedEntries.length - 1 && (
                  <span className="absolute top-5 h-full w-px bg-slate-200" />
                )}

                <span
                  className={`relative z-10 mt-1 h-4 w-4 rounded-full border-4 border-white ring-2 ${
                    STATUS_STYLES[entry.toStatus]
                  }`}
                />
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">
                        {humanize(entry.eventType)}
                      </h3>

                      {isCurrent && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700">
                          Current stage
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-slate-600">
                      {entry.fromStatus
                        ? (
                            `${humanize(
                              entry.fromStatus
                            )} → `
                          )
                        : ""}
                      {humanize(entry.toStatus)}
                    </p>
                  </div>

                  <time className="text-xs text-slate-400">
                    {formatDateTime(entry.createdAt)}
                  </time>
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-600">
                    Source: {humanize(entry.source)}
                  </span>

                  {stageDuration !== undefined && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 font-medium text-blue-700">
                      Time in {humanize(entry.toStatus)}:{" "}
                      {formatDuration(stageDuration)}
                    </span>
                  )}
                </div>

                {entry.detail && (
                  <p className="mt-3 text-sm leading-6 text-slate-500">
                    {entry.detail}
                  </p>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-slate-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="mt-1 font-semibold text-slate-900">
        {value}
      </p>
    </div>
  );
}

function parseTime(value: string): number {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function durationBetween(
  start: number,
  end: number
): number | undefined {
  if (
    start <= 0
    || end <= 0
    || end < start
  ) {
    return undefined;
  }

  return end - start;
}

function formatDuration(
  duration: number | undefined
): string {
  if (duration === undefined) {
    return "—";
  }

  const totalSeconds = Math.max(
    0,
    Math.floor(duration / 1000)
  );
  const hours = Math.floor(
    totalSeconds / 3600
  );
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60
  );
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString(
    [],
    {
      dateStyle: "medium",
      timeStyle: "medium"
    }
  );
}

function humanize(value: string): string {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(
      /\b\w/g,
      (character) => character.toUpperCase()
    );
}