"use client";

import { useEffect, useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { getLatestRobotOperation, requestRobotOperation } from "@/lib/api";
import { adminUiText } from "@/lib/i18n";
import type { RobotOperation, RobotOperationAction } from "@/types";

const TERMINAL = new Set(["SUCCEEDED", "FAILED"]);

type RobotOperationsControlProps = {
  compact?: boolean;
  mode?: "recovery" | "admin";
};

export default function RobotOperationsControl({ compact = false, mode = "recovery" }: RobotOperationsControlProps) {
  const { robot } = useDeliveryApi();
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const [operation, setOperation] = useState<RobotOperation>();
  const [error, setError] = useState("");
  const busy = Boolean(operation && !TERMINAL.has(operation.status));

  useEffect(() => {
    void getLatestRobotOperation(robot.id).then(setOperation).catch(() => undefined);
  }, [robot.id]);

  useEffect(() => {
    if (!busy) return;
    const timer = window.setInterval(() => {
      void getLatestRobotOperation(robot.id).then(setOperation).catch(() => undefined);
    }, 1200);
    return () => window.clearInterval(timer);
  }, [busy, robot.id]);

  async function run(action: RobotOperationAction, confirm = false) {
    setError("");
    try {
      setOperation(await requestRobotOperation(robot.id, action, confirm));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.robotOperationFailed);
    }
  }

  function confirmAndRun(action: RobotOperationAction, message: string) {
    if (window.confirm(message)) void run(action, true);
  }

  if (mode === "admin") return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">Admin</p>
    <h2 className="mt-1 font-bold text-slate-950">{copy.advancedRobotControls}</h2>
    <p className="mt-2 text-xs leading-5 text-slate-500">{copy.advancedRobotControlsHelp}</p>
    <div className="mt-4 grid gap-2">
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("system.start_navigation")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
        {busy && operation?.action === "system.start_navigation" ? copy.startingRobotStack : copy.startRobotStack}
      </button>
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("navigation.restart_if_broken")} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50">{copy.restartNav2}</button>
      <button type="button" disabled={!robot.online || busy} onClick={() => confirmAndRun("system.stop_navigation", copy.stopRobotStackConfirm)} className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{copy.stopRobotStack}</button>
      <button type="button" disabled={!robot.online || busy} onClick={() => confirmAndRun("system.shutdown", copy.shutdownOdroidConfirm)} className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:bg-slate-300">{copy.shutdownOdroid}</button>
    </div>
    {(operation || error) && <OperationResult operation={operation} error={error} fallback={copy.robotOperationFailed} />}
  </section>;

  return <section className={compact ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" : "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"}>
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{copy.navigationRecovery}</p>
      <h2 className={`${compact ? "text-sm" : "mt-1 text-lg"} font-bold text-slate-950`}>{copy.robotOperations}</h2>
    </div>
    <p className={`${compact ? "mt-1 text-xs leading-5" : "mt-1 text-sm leading-6"} text-slate-500`}>{copy.recoverNavigationHelp}</p>
    <div className={compact ? "mt-3 grid grid-cols-2 gap-2" : ""}>
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("navigation.recover")} className={`${compact ? "h-9 px-2 text-[11px]" : "mt-5 px-3 py-2.5 text-xs sm:text-sm"} w-full rounded-xl bg-blue-600 font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300`}>
        {busy && operation?.action === "navigation.recover" ? copy.recoveringNavigation : copy.recoverNavigation}
      </button>
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("motor.reset_stall")} className={`${compact ? "h-9 px-2 text-[11px]" : "mt-3 px-3 py-2.5 text-xs sm:text-sm"} w-full rounded-xl border border-slate-300 bg-white font-bold text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400`}>
        {busy && operation?.action === "motor.reset_stall" ? copy.resettingMotorStall : copy.resetMotorStall}
      </button>
    </div>
    {!compact && <p className="mt-2 text-xs leading-5 text-slate-500">{copy.resetMotorStallHelp}</p>}
    {(operation || error) && <OperationResult operation={operation} error={error} fallback={copy.robotOperationFailed} />}
  </section>;
}

function OperationResult({ operation, error, fallback }: { operation?: RobotOperation; error: string; fallback: string }) {
  return <div className={`mt-4 rounded-xl border p-3 text-sm ${operation?.status === "FAILED" || error ? "border-red-200 bg-red-50 text-red-800" : operation?.status === "SUCCEEDED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
    <p className="font-bold">{operation?.failureCategory ?? operation?.status ?? fallback}</p>
    <p className="mt-1 leading-5">{error || operation?.detail}</p>
  </div>;
}
