"use client";

import { ReactNode, useEffect, useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { getLatestRobotOperation, requestRobotOperation } from "@/lib/api";
import { adminUiText } from "@/lib/i18n";
import type { RobotOperation, RobotOperationAction } from "@/types";

const TERMINAL = new Set(["SUCCEEDED", "FAILED"]);

type RobotOperationsControlProps = {
  compact?: boolean;
  mode?: "recovery" | "admin";
  collapsible?: boolean;
  defaultExpanded?: boolean;
};

export default function RobotOperationsControl({ compact = false, mode = "recovery", collapsible, defaultExpanded = true }: RobotOperationsControlProps) {
  const { robot } = useDeliveryApi();
  const { locale } = useLocale();
  const copy = adminUiText[locale];
  const [operation, setOperation] = useState<RobotOperation>();
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState<{ action: RobotOperationAction; message: string }>();
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
    setConfirmation({ action, message });
  }

  if (mode === "admin") return <ControlCard collapsible={collapsible ?? false} defaultExpanded={defaultExpanded} eyebrow="Admin" title={copy.advancedRobotControls} description={copy.advancedRobotControlsHelp}>
    <div className="grid gap-2">
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("system.start_navigation")} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300">
        {busy && operation?.action === "system.start_navigation" ? copy.startingRobotStack : copy.startRobotStack}
      </button>
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("navigation.restart_if_broken")} className="rounded-xl border border-amber-300 bg-white px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50 disabled:opacity-50">{copy.restartNav2}</button>
      <button type="button" disabled={!robot.online || busy} onClick={() => confirmAndRun("system.stop_navigation", copy.stopRobotStackConfirm)} className="rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-50">{copy.stopRobotStack}</button>
      <button type="button" disabled={!robot.online || busy} onClick={() => confirmAndRun("system.shutdown", copy.shutdownOdroidConfirm)} className="rounded-xl bg-red-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-800 disabled:bg-slate-300">{copy.shutdownOdroid}</button>
    </div>
    {(operation || error) && <OperationResult operation={operation} error={error} fallback={copy.robotOperationFailed} />}
    {confirmation && <ConfirmationDialog message={confirmation.message} cancelLabel={locale === "th" ? "ยกเลิก" : "Cancel"} confirmLabel={locale === "th" ? "ยืนยัน" : "Confirm"} onCancel={() => setConfirmation(undefined)} onConfirm={() => { const action = confirmation.action; setConfirmation(undefined); void run(action, true); }} />}
  </ControlCard>;

  return <ControlCard compact={compact} collapsible={collapsible ?? compact} defaultExpanded={defaultExpanded} eyebrow={copy.navigationRecovery} title={copy.robotOperations} description={copy.recoverNavigationHelp}>
    <div>
      <button type="button" disabled={!robot.online || busy} onClick={() => void run("navigation.recover")} className={`${compact ? "min-h-9 grow shrink-0 whitespace-nowrap px-3 text-[11px]" : "mt-5 px-3 py-2.5 text-xs sm:text-sm"} ${compact ? "" : "w-full"} rounded-xl bg-blue-600 font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300`}>
        {busy && operation?.action === "navigation.recover" ? copy.recoveringNavigation : copy.recoverNavigation}
      </button>
    </div>
    {(operation || error) && <OperationResult operation={operation} error={error} fallback={copy.robotOperationFailed} />}
  </ControlCard>;
}

function ControlCard({ compact = false, collapsible, defaultExpanded, eyebrow, title, description, children }: { compact?: boolean; collapsible: boolean; defaultExpanded: boolean; eyebrow: string; title: string; description: string; children: ReactNode }) {
  const [expanded, setExpanded] = useState(!collapsible || defaultExpanded);
  return <section className={compact ? "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" : "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"}>
    <div className="flex items-start justify-between gap-3">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{eyebrow}</p><h2 className={`${compact ? "text-sm" : "mt-1"} font-bold text-slate-950`}>{title}</h2></div>
      {collapsible && <button type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="grid min-h-10 min-w-10 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><span aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`}>⌄</span></button>}
    </div>
    {expanded && <div><p className={`${compact ? "mt-1 text-xs leading-5" : "mt-2 text-xs leading-5"} text-slate-500`}>{description}</p><div className="mt-3">{children}</div></div>}
  </section>;
}

function ConfirmationDialog({ message, cancelLabel, confirmLabel, onCancel, onConfirm }: { message: string; cancelLabel: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void }) {
  return <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><div role="alertdialog" aria-modal="true" aria-labelledby="robot-operation-confirm-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"><h2 id="robot-operation-confirm-title" className="text-lg font-bold text-slate-950">{confirmLabel}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{message}</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" autoFocus onClick={onCancel} className="min-h-11 rounded-xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50">{cancelLabel}</button><button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-red-700 font-bold text-white hover:bg-red-800">{confirmLabel}</button></div></div></div>;
}

function OperationResult({ operation, error, fallback }: { operation?: RobotOperation; error: string; fallback: string }) {
  return <div className={`mt-4 rounded-xl border p-3 text-sm ${operation?.status === "FAILED" || error ? "border-red-200 bg-red-50 text-red-800" : operation?.status === "SUCCEEDED" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
    <p className="font-bold">{operation?.failureCategory ?? operation?.status ?? fallback}</p>
    <p className="mt-1 leading-5">{error || operation?.detail}</p>
  </div>;
}
