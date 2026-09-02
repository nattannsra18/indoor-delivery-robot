"use client";

import { useEffect, useState } from "react";
import {
  DiagnosticLevel,
  DiagnosticStatus,
  RobotDiagnostics
} from "@/types";

const STALE_AFTER_MS = 5000;

const FRIENDLY_NAMES: Record<string, string> = {
  "AMR/LiDAR": "LiDAR",
  "AMR/Odometry": "Odometry",
  "AMR/VelocityCommand": "Velocity Command",
  "AMR/Camera": "RGB Camera",
  "AMR/ArUco": "ArUco Detection",
  "AMR/Localization": "AMCL Localization"
};

const LEVEL_STYLES: Record<
  DiagnosticLevel,
  {
    badge: string;
    border: string;
    dot: string;
  }
> = {
  OK: {
    badge: "bg-emerald-50 text-emerald-700",
    border: "border-emerald-100",
    dot: "bg-emerald-500"
  },
  WARN: {
    badge: "bg-amber-50 text-amber-700",
    border: "border-amber-100",
    dot: "bg-amber-500"
  },
  ERROR: {
    badge: "bg-red-50 text-red-700",
    border: "border-red-100",
    dot: "bg-red-500"
  },
  STALE: {
    badge: "bg-slate-100 text-slate-600",
    border: "border-slate-200",
    dot: "bg-slate-400"
  }
};

type DiagnosticsCardsProps = {
  diagnostics?: RobotDiagnostics;
};

export default function DiagnosticsCards({
  diagnostics
}: DiagnosticsCardsProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(
      () => setNow(Date.now()),
      1000
    );

    return () => window.clearInterval(timer);
  }, []);

  if (!diagnostics) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-slate-900">
          Robot Diagnostics
        </h2>
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
          Waiting for ROS diagnostics
        </div>
      </section>
    );
  }

  const receivedAt = Date.parse(diagnostics.serverTime);
  const ageMs = Math.max(0, now - receivedAt);
  const locallyStale = ageMs > STALE_AFTER_MS;
  const overallLevel = locallyStale
    ? "STALE"
    : diagnostics.overallLevel;

  return (
    <section
      aria-live="polite"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-900">
            Robot Diagnostics
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Live ROS 2 topic and sensor health for {diagnostics.robotId}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <LevelBadge
            level={overallLevel}
            label={
              locallyStale ? "Unavailable" : overallLevel
            }
          />
          <span className="text-xs text-slate-400">
            {formatAge(ageMs)}
          </span>
        </div>
      </div>

      {diagnostics.statuses.length === 0 ? (
        <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
          No diagnostic statuses received
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {diagnostics.statuses.map((status, index) => (
            <DiagnosticCard
              key={`${status.name}-${index}`}
              status={status}
              locallyStale={locallyStale}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function DiagnosticCard({
  status,
  locallyStale
}: {
  status: DiagnosticStatus;
  locallyStale: boolean;
}) {
  const displayLevel = locallyStale
    ? "STALE"
    : status.level;
  const style = LEVEL_STYLES[displayLevel];
  const details = status.values.slice(0, 4);

  return (
    <article className={`rounded-xl border p-4 ${style.border}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 shrink-0 rounded-full ${style.dot}`}
            />
            <h3 className="truncate text-sm font-semibold text-slate-900">
              {FRIENDLY_NAMES[status.name] ?? status.name}
            </h3>
          </div>
          {FRIENDLY_NAMES[status.name] && (
            <p className="mt-1 truncate text-xs text-slate-400">
              {status.name}
            </p>
          )}
        </div>
        <LevelBadge
          level={displayLevel}
          label={
            locallyStale && status.level !== "STALE"
              ? `STALE · was ${status.level}`
              : displayLevel
          }
        />
      </div>

      <p className="mt-3 text-sm leading-5 text-slate-600">
        {status.message || "No diagnostic message"}
      </p>

      {details.length > 0 && (
        <dl className="mt-3 space-y-1.5 border-t border-slate-100 pt-3">
          {details.map((detail, index) => (
            <div
              key={`${detail.key}-${index}`}
              className="flex items-start justify-between gap-3 text-xs"
            >
              <dt className="text-slate-400">
                {formatKey(detail.key)}
              </dt>
              <dd className="break-all text-right font-medium text-slate-700">
                {detail.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  );
}

function LevelBadge({
  level,
  label
}: {
  level: DiagnosticLevel;
  label: string;
}) {
  return (
    <span
      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${LEVEL_STYLES[level].badge}`}
    >
      {label}
    </span>
  );
}

function formatKey(key: string): string {
  return key
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatAge(ageMs: number): string {
  const seconds = Math.floor(ageMs / 1000);

  if (seconds < 1) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds}s ago`;

  const minutes = Math.floor(seconds / 60);
  return `Updated ${minutes}m ago`;
}
