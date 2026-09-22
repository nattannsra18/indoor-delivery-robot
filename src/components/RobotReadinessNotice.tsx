"use client";

import Link from "next/link";
import { useLocale } from "@/context/LocaleContext";
import {
  adminUiText,
  robotReadinessCheckText,
  robotReadinessText,
} from "@/lib/i18n";
import type {
  FleetRobot,
  FleetUnavailableReason,
  RobotProfileValidationResult,
} from "@/types";

type RobotReadinessNoticeProps = {
  robot?: FleetRobot;
  compact?: boolean;
};

const REASON_COPY_KEY: Record<
  FleetUnavailableReason,
  keyof (typeof adminUiText)["en"]
> = {
  ROBOT_OFFLINE: "fleetReasonOffline",
  ROBOT_NOT_PAIRED: "fleetReasonNotPaired",
  ROBOT_NOT_READY: "fleetReasonNotReady",
  NAVIGATION_UNAVAILABLE: "fleetReasonNavigation",
  ACTIVE_MAP_UNKNOWN: "fleetReasonMapUnknown",
  EMERGENCY_STOP_ACTIVE: "fleetReasonEmergency",
  MAPPING_ACTIVE: "fleetReasonMapping",
};

export default function RobotReadinessNotice({
  robot,
  compact = false,
}: RobotReadinessNoticeProps) {
  const { locale } = useLocale();
  if (!robot) return null;

  const copy = robotReadinessText[locale];
  const ui = adminUiText[locale];
  const checks = robot.validationResults
    .filter((item) => item.status !== "PASS")
    .sort((left, right) => severity(right) - severity(left));
  const visibleChecks = compact ? checks.slice(0, 2) : checks;
  const localizationBlocked = checks.some((item) => (
    item.checkId === "data.amcl_pose"
    || item.checkId === "tf.map_to_odom"
    || item.checkId === "lifecycle.amcl"
  ));
  const reasonKey = REASON_COPY_KEY[robot.unavailableReason ?? "ROBOT_NOT_READY"];
  const fallback = robot.readinessDetail || ui[reasonKey];
  const title = robot.unavailableReason && robot.unavailableReason !== "ROBOT_NOT_READY"
    ? ui[reasonKey]
    : robot.readinessStatus === "DEGRADED"
      ? copy.degradedTitle
      : copy.blockedTitle;
  const blocked = Boolean(robot.unavailableReason)
    && !robot.allowsSupervisedNavigation;

  return (
    <div
      role={blocked ? "alert" : "status"}
      className={`rounded-xl border p-3 ${
        robot.readinessStatus === "NOT_READY"
          ? "border-red-200 bg-red-50 text-red-950"
          : "border-amber-200 bg-amber-50 text-amber-950"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white ${robot.readinessStatus === "NOT_READY" ? "bg-red-600" : "bg-amber-500"}`}>!</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{title}</p>
          <p className="mt-0.5 text-xs leading-5 opacity-80">
            {checks.length > 0
              ? copy.checkCount.replace("{count}", String(checks.length))
              : fallback || copy.reportPending}
          </p>
        </div>
      </div>

      {visibleChecks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {visibleChecks.map((check) => (
            <ReadinessCheck key={check.checkId} check={check} locale={locale} />
          ))}
        </ul>
      )}

      {compact && checks.length > visibleChecks.length && (
        <p className="mt-2 text-xs font-semibold opacity-75">
          +{checks.length - visibleChecks.length}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 border-t border-current/10 pt-3">
        {localizationBlocked && (
          <Link href="/maps?view=localization" className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700">
            {copy.openLocalization}
          </Link>
        )}
        <Link href="/diagnostics" className="rounded-lg border border-current/20 bg-white/80 px-3 py-2 text-xs font-bold hover:bg-white">
          {copy.openDiagnostics}
        </Link>
      </div>
    </div>
  );
}

function ReadinessCheck({
  check,
  locale,
}: {
  check: RobotProfileValidationResult;
  locale: "en" | "th";
}) {
  const copy = robotReadinessText[locale];
  const known = robotReadinessCheckText[locale][check.checkId];
  const label = known?.label ?? check.message;
  const action = known?.action;

  return (
    <li data-readiness-check={check.checkId} className="rounded-lg bg-white/75 p-2.5 text-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold leading-5 text-slate-900">{label}</p>
          <code className="mt-0.5 block break-all text-[10px] text-slate-500">{check.checkId}</code>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${check.status === "FAIL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
          {check.status === "FAIL" ? copy.required : copy.warning}
        </span>
      </div>
      {action && <p className="mt-1.5 leading-5 text-slate-700">{action}</p>}
      {check.observed && (
        <p className="mt-1 break-words text-slate-500">
          <span className="font-semibold">{copy.observed}:</span> {check.observed}
        </p>
      )}
    </li>
  );
}

function severity(check: RobotProfileValidationResult) {
  return check.status === "FAIL" ? 2 : check.status === "WARN" ? 1 : 0;
}
