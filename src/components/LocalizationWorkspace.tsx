"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import RobotMap from "@/components/RobotMap";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { driveLocalizationRecovery, getLocalizationStatus, runGlobalLocalization, setLocalizationInitialPose, startLocalizationScan, stopLocalizationScan } from "@/lib/api";
import { localizationText } from "@/lib/i18n";
import type { LocalizationReason, LocalizationStatus } from "@/types";

const wait = (milliseconds: number) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

export default function LocalizationWorkspace() {
  const { locale } = useLocale();
  const copy = localizationText[locale];
  const { robot, selectedRobotId } = useDeliveryApi();
  const targetRobotId = selectedRobotId || robot.id;
  const [status, setStatus] = useState<LocalizationStatus>();
  const [draft, setDraft] = useState<{ x: number; y: number; yaw: number }>();
  const [positionUncertainty, setPositionUncertainty] = useState(0.5);
  const [yawUncertaintyDegrees, setYawUncertaintyDegrees] = useState(20);
  const [busy, setBusy] = useState(false);
  const [confirmGlobal, setConfirmGlobal] = useState(false);
  const [toast, setToast] = useState<{ kind: "success" | "error"; title: string; body: string }>();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [driveSpeed, setDriveSpeed] = useState(0.08);
  const driveTimer = useRef<number | undefined>(undefined);
  const driveStopTimer = useRef<number | undefined>(undefined);
  const driveStartedAt = useRef(0);
  const activeDriveKey = useRef<string | undefined>(undefined);
  const targetRobotIdRef = useRef(targetRobotId);

  useEffect(() => {
    targetRobotIdRef.current = targetRobotId;
    setStatus(undefined);
    setDraft(undefined);
    setToast(undefined);
    setConfirmGlobal(false);
  }, [targetRobotId]);

  const load = useCallback(async () => {
    const requestedRobotId = targetRobotId;
    try {
      const next = await getLocalizationStatus(requestedRobotId);
      if (targetRobotIdRef.current === requestedRobotId) setStatus(next);
    } catch (reason) {
      if (targetRobotIdRef.current !== requestedRobotId) return;
      setToast({ kind: "error", title: copy.commandFailed, body: reason instanceof Error ? reason.message : copy.loadFailed });
    }
  }, [copy.commandFailed, copy.loadFailed, targetRobotId]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 500);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!confirmGlobal) return;
    const previous = document.activeElement as HTMLElement | null;
    const fallbackTrigger = triggerRef.current;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setConfirmGlobal(false);
      if (event.key !== "Tab" || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")];
      if (!items.length) return;
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = originalOverflow; (previous ?? fallbackTrigger)?.focus(); };
  }, [confirmGlobal]);

  const awaitCommand = async (commandId?: string) => {
    if (!commandId) return;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await wait(350);
      const next = await getLocalizationStatus(targetRobotId);
      if (targetRobotIdRef.current !== targetRobotId) return;
      setStatus(next);
      if (!next.pendingCommandId && next.lastCommandId === commandId) {
        if (!next.lastCommandSucceeded) throw new Error(next.detail || copy.commandFailed);
        return;
      }
    }
    throw new Error(copy.commandFailed);
  };

  const setInitialPose = async () => {
    if (!draft) return;
    setBusy(true); setToast(undefined);
    try {
      const pending = await setLocalizationInitialPose({ robotId: targetRobotId, pose: { frameId: "map", ...draft }, positionUncertainty, yawUncertainty: yawUncertaintyDegrees * Math.PI / 180 });
      setStatus(pending);
      await awaitCommand(pending.pendingCommandId);
      setToast({ kind: "success", title: copy.poseSuccess, body: copy.ready });
    } catch (reason) {
      setToast({ kind: "error", title: copy.commandFailed, body: reason instanceof Error ? reason.message : copy.commandFailed });
    } finally { setBusy(false); }
  };

  const globalRelocalize = async () => {
    setConfirmGlobal(false); setBusy(true); setToast(undefined);
    try {
      const pending = await runGlobalLocalization(targetRobotId);
      setStatus(pending);
      await awaitCommand(pending.pendingCommandId);
      setToast({ kind: "success", title: copy.globalSuccess, body: copy.globalHelp });
    } catch (reason) {
      setToast({ kind: "error", title: copy.commandFailed, body: reason instanceof Error ? reason.message : copy.commandFailed });
    } finally { setBusy(false); }
  };

  const clearDriveTimers = useCallback(() => {
    if (driveTimer.current !== undefined) window.clearInterval(driveTimer.current);
    if (driveStopTimer.current !== undefined) window.clearTimeout(driveStopTimer.current);
    driveTimer.current = undefined;
    driveStopTimer.current = undefined;
  }, []);
  const stopDrive = useCallback(() => {
    clearDriveTimers();
    if (status?.recoveryActive) void driveLocalizationRecovery(0, 0, targetRobotId).catch(() => undefined);
  }, [clearDriveTimers, status?.recoveryActive, targetRobotId]);
  const releaseDrive = useCallback(() => {
    if (driveTimer.current === undefined) return;
    window.clearInterval(driveTimer.current);
    driveTimer.current = undefined;
    const remaining = Math.max(0, 300 - (performance.now() - driveStartedAt.current));
    driveStopTimer.current = window.setTimeout(() => {
      driveStopTimer.current = undefined;
      if (status?.recoveryActive) void driveLocalizationRecovery(0, 0, targetRobotId).catch(() => undefined);
    }, remaining);
  }, [status?.recoveryActive, targetRobotId]);
  const startDrive = useCallback((linear: number, angular: number) => {
    if (!status?.recoveryActive) return;
    clearDriveTimers();
    driveStartedAt.current = performance.now();
    const send = () => void driveLocalizationRecovery(linear, angular, targetRobotId).catch((reason) => {
      stopDrive();
      setToast({ kind: "error", title: copy.commandFailed, body: reason instanceof Error ? reason.message : copy.commandFailed });
    });
    send();
    driveTimer.current = window.setInterval(send, 180);
  }, [clearDriveTimers, copy.commandFailed, status?.recoveryActive, stopDrive, targetRobotId]);
  const turnSpeed = Math.min(0.4, driveSpeed * 3.3);
  const toggleAutomaticScan = async () => {
    setBusy(true);
    try {
      if (status?.automaticScanActive) await stopLocalizationScan(targetRobotId);
      else await startLocalizationScan(targetRobotId);
      await wait(550);
      await load();
    } catch (reason) {
      setToast({ kind: "error", title: copy.commandFailed, body: reason instanceof Error ? reason.message : copy.commandFailed });
    } finally { setBusy(false); }
  };
  useEffect(() => {
    if (!status?.recoveryActive || status.automaticScanActive) return;
    const commands: Record<string, [number, number]> = {
      ArrowUp: [driveSpeed, 0], w: [driveSpeed, 0],
      ArrowDown: [-driveSpeed * 0.75, 0], s: [-driveSpeed * 0.75, 0],
      ArrowLeft: [0, turnSpeed], a: [0, turnSpeed],
      ArrowRight: [0, -turnSpeed], d: [0, -turnSpeed],
    };
    const keyDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === " " || key === "Spacebar") { event.preventDefault(); activeDriveKey.current = undefined; stopDrive(); return; }
      const command = commands[key];
      if (!command || event.repeat || activeDriveKey.current === key || isFormControl(event.target)) return;
      event.preventDefault(); activeDriveKey.current = key; startDrive(...command);
    };
    const keyUp = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (activeDriveKey.current !== key) return;
      event.preventDefault(); activeDriveKey.current = undefined; releaseDrive();
    };
    const blur = () => { activeDriveKey.current = undefined; stopDrive(); };
    window.addEventListener("keydown", keyDown); window.addEventListener("keyup", keyUp); window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", keyDown); window.removeEventListener("keyup", keyUp); window.removeEventListener("blur", blur); activeDriveKey.current = undefined; stopDrive(); };
  }, [driveSpeed, releaseDrive, startDrive, status?.automaticScanActive, status?.recoveryActive, stopDrive, turnSpeed]);
  const driveProps = (linear: number, angular: number) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => { event.currentTarget.setPointerCapture(event.pointerId); startDrive(linear, angular); },
    onPointerUp: releaseDrive, onPointerCancel: stopDrive, onLostPointerCapture: releaseDrive,
    onKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => { if (!event.repeat && (event.key === " " || event.key === "Enter")) startDrive(linear, angular); },
    onKeyUp: releaseDrive,
  });

  const healthLabel = status?.health === "LOCALIZED" ? copy.localized : status?.health === "DEGRADED" ? copy.degraded : status?.health === "LOST" ? copy.lost : copy.unknown;
  const healthTone = status?.health === "LOCALIZED" ? "text-emerald-700 bg-emerald-50" : status?.health === "DEGRADED" ? "text-amber-700 bg-amber-50" : status?.health === "LOST" ? "text-rose-700 bg-rose-50" : "text-slate-600 bg-slate-50";
  const reason = reasonLabel(status?.reason, copy);
  const commandReady = robot.id === targetRobotId && robot.online && robot.state === "IDLE" && !robot.currentTaskId && !status?.pendingCommandId;

  return <>
    {toast && <div className={`fixed right-5 top-5 z-[70] max-w-sm rounded-2xl border p-4 shadow-xl ${toast.kind === "success" ? "border-emerald-200 bg-white" : "border-rose-200 bg-white"}`} role={toast.kind === "error" ? "alert" : "status"}><div className="flex items-start gap-3"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${toast.kind === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{toast.kind === "success" ? "✓" : "!"}</span><div className="min-w-0 flex-1"><p className="font-bold text-slate-950">{toast.title}</p><p className="mt-1 text-sm leading-5 text-slate-600">{toast.body}</p></div><button type="button" onClick={() => setToast(undefined)} aria-label={copy.close} className="rounded-lg px-2 text-xl text-slate-400 hover:bg-slate-100">×</button></div></div>}
    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatusCard label={copy.health} value={healthLabel} detail={reason} tone={healthTone} />
      <StatusCard label={copy.amcl} value={status?.amclState === "ACTIVE" ? copy.active : status?.amclState === "INACTIVE" ? copy.inactive : copy.unknown} detail={status?.tfAvailable ? `${copy.tf}: ${copy.available}` : `${copy.tf}: ${copy.unavailable}`} />
      <StatusCard label={copy.poseAge} value={status?.poseAgeSeconds === undefined ? "—" : copy.seconds.replace("{value}", status.poseAgeSeconds.toFixed(1))} detail={status?.moving ? copy.moving : copy.stationary} />
      <StatusCard label={copy.activeMap} value={status?.mapId ?? "—"} detail={`${copy.recoveries}: ${status?.recoveryCount ?? 0}`} />
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-950">{copy.initialPose}</h2><p className="mt-1 text-sm text-slate-500">{copy.clickMap}</p></header><div className="p-3 md:p-4"><RobotMap showStations={false} showStationButtons={false} smoothMotion draftPose={draft} draftPoseLabel={copy.draftPose} mapAriaLabel={copy.selectPoseAria} onMapPoseSelect={setDraft} /></div></section>
      <div className="space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{copy.currentPose}</h2><p className="mt-1 text-sm text-slate-500">{copy.currentPoseHelp}</p>{status?.pose ? <dl className="mt-4 grid grid-cols-2 gap-3"><Metric label={copy.x} value={`${status.pose.x.toFixed(2)} m`} /><Metric label={copy.y} value={`${status.pose.y.toFixed(2)} m`} /><Metric label={copy.yaw} value={`${(status.pose.yaw * 180 / Math.PI).toFixed(1)}°`} /><Metric label={copy.positionUncertainty} value={status.positionUncertainty === undefined ? "—" : `${status.positionUncertainty.toFixed(2)} m`} /></dl> : <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{copy.noPose}</p>}</section>
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-bold text-slate-950">{copy.initialPose}</h2><p className="mt-1 text-sm leading-5 text-slate-500">{copy.initialPoseHelp}</p><div className="mt-4 grid grid-cols-2 gap-3"><NumberField label={copy.x} value={draft?.x} onChange={(value) => setDraft((current) => ({ x: value, y: current?.y ?? 0, yaw: current?.yaw ?? 0 }))} /><NumberField label={copy.y} value={draft?.y} onChange={(value) => setDraft((current) => ({ x: current?.x ?? 0, y: value, yaw: current?.yaw ?? 0 }))} /><NumberField label={`${copy.yaw} (°)`} value={draft ? draft.yaw * 180 / Math.PI : undefined} onChange={(value) => setDraft((current) => ({ x: current?.x ?? 0, y: current?.y ?? 0, yaw: normalizeRadians(value * Math.PI / 180) }))} /><NumberField label={`${copy.positionUncertainty} (m)`} value={positionUncertainty} min={0.05} max={5} onChange={setPositionUncertainty} /></div><label className="mt-3 block text-xs font-semibold text-slate-600">{copy.yawUncertainty} (°)<input type="range" min="3" max="180" value={yawUncertaintyDegrees} onChange={(event) => setYawUncertaintyDegrees(Number(event.target.value))} className="mt-2 w-full" /><span className="text-sm text-slate-700">±{yawUncertaintyDegrees}°</span></label><div className="mt-4 grid gap-2 sm:grid-cols-2"><button type="button" disabled={!status?.pose || busy} onClick={() => status?.pose && setDraft({ x: status.pose.x, y: status.pose.y, yaw: status.pose.yaw })} className="min-h-11 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 disabled:opacity-40">{copy.useCurrent}</button><button type="button" disabled={!draft || !commandReady || busy} onClick={() => void setInitialPose()} className="min-h-11 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white disabled:bg-slate-300">{busy ? copy.sending : copy.setPose}</button></div></section>
        <section className="rounded-3xl border border-amber-200 bg-amber-50/60 p-5"><h2 className="font-bold text-slate-950">{copy.global}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{copy.globalHelp}</p><button ref={triggerRef} type="button" disabled={!commandReady || busy} onClick={() => setConfirmGlobal(true)} className="mt-4 min-h-11 w-full rounded-xl border border-amber-300 bg-white px-4 text-sm font-bold text-amber-800 disabled:opacity-40">{copy.relocalize}</button></section>
        {status?.recoveryActive && <section className="rounded-3xl border border-blue-200 bg-blue-50/60 p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-slate-950">{copy.recoveryControl}</h2><p className="mt-1 text-sm text-slate-600">{copy.recoveryControlHelp}</p></div><span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">{status.automaticScanActive ? copy.scanning : copy.searching}</span></div><button type="button" disabled={busy} onClick={() => void toggleAutomaticScan()} className={`mt-4 min-h-11 w-full rounded-xl px-4 text-sm font-bold disabled:opacity-50 ${status.automaticScanActive ? "border border-rose-200 bg-white text-rose-700" : "bg-blue-600 text-white"}`}>{status.automaticScanActive ? copy.stopAutomaticScan : copy.automaticScan}</button>{status.automaticScanActive && <div className="mt-3"><div className="h-2 overflow-hidden rounded-full bg-blue-100"><div className="h-full rounded-full bg-blue-600 transition-[width] duration-500" style={{ width: `${Math.round(status.automaticScanProgress * 100)}%` }} /></div><p className="mt-2 text-center text-xs text-slate-500">{copy.automaticScanHelp}</p></div>}<label className="mt-5 block text-sm font-bold text-slate-700">{copy.speed}<span className="float-right font-mono text-blue-700">{driveSpeed.toFixed(2)} m/s</span><input type="range" min="0.05" max="0.12" step="0.01" value={driveSpeed} disabled={status.automaticScanActive} onChange={(event) => setDriveSpeed(Number(event.target.value))} className="mt-3 w-full accent-blue-600 disabled:opacity-40" /></label><div className="mx-auto mt-4 grid max-w-[230px] grid-cols-3 gap-2 select-none"><span /><RecoveryDriveButton disabled={status.automaticScanActive} label={copy.forward} {...driveProps(driveSpeed, 0)}>↑</RecoveryDriveButton><span /><RecoveryDriveButton disabled={status.automaticScanActive} label={copy.left} {...driveProps(0, turnSpeed)}>↶</RecoveryDriveButton><RecoveryDriveButton label={copy.stopRobot} onClick={() => status.automaticScanActive ? void toggleAutomaticScan() : stopDrive()}>■</RecoveryDriveButton><RecoveryDriveButton disabled={status.automaticScanActive} label={copy.right} {...driveProps(0, -turnSpeed)}>↷</RecoveryDriveButton><span /><RecoveryDriveButton disabled={status.automaticScanActive} label={copy.backward} {...driveProps(-driveSpeed * 0.75, 0)}>↓</RecoveryDriveButton><span /></div><p className="mt-3 text-center text-xs font-semibold leading-5 text-slate-500">{copy.keyboardHelp}</p><p className="mt-1 text-center text-xs leading-5 text-slate-400">{copy.deadmanHelp}</p></section>}
        <p className="px-1 text-xs leading-5 text-slate-500">{copy.safety}</p>
      </div>
    </div>
    {confirmGlobal && <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmGlobal(false); }}><div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="localization-confirm-title" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><h2 id="localization-confirm-title" className="text-xl font-bold text-slate-950">{copy.confirmTitle}</h2><p className="mt-3 text-sm leading-6 text-slate-600">{copy.confirmBody}</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirmGlobal(false)} className="min-h-11 rounded-xl border border-slate-200 font-bold text-slate-700">{copy.cancel}</button><button type="button" onClick={() => void globalRelocalize()} className="min-h-11 rounded-xl bg-amber-600 font-bold text-white">{copy.confirm}</button></div></div></div>}
  </>;
}

function reasonLabel(reason: LocalizationReason | undefined, copy: (typeof localizationText)[keyof typeof localizationText]) {
  const labels: Record<LocalizationReason, string> = { READY: copy.ready, ROBOT_OFFLINE: copy.unknown, MAPPING_ACTIVE: copy.mappingActive, AMCL_INACTIVE: copy.amclInactive, NO_POSE: copy.noPoseReason, TF_UNAVAILABLE: copy.tfUnavailable, POSE_STALE: copy.poseStale, HIGH_UNCERTAINTY: copy.highUncertainty };
  return reason ? labels[reason] : copy.noPoseReason;
}
function normalizeRadians(value: number) { return Math.atan2(Math.sin(value), Math.cos(value)); }
function isFormControl(target: EventTarget | null) { return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement; }
function RecoveryDriveButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) { return <button type="button" aria-label={label} title={label} className="grid size-16 touch-none place-items-center rounded-2xl border border-blue-200 bg-white text-2xl font-black text-blue-700 transition active:scale-95 active:bg-blue-600 active:text-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-300" {...props}>{children}</button>; }
function StatusCard({ label, value, detail, tone = "bg-white text-slate-950" }: { label: string; value: string; detail: string; tone?: string }) { return <article className={`rounded-2xl border border-slate-200 p-4 shadow-sm ${tone}`}><p className="text-xs font-bold uppercase tracking-wide opacity-70">{label}</p><p className="mt-2 text-xl font-extrabold">{value}</p><p className="mt-1 text-xs opacity-75">{detail}</p></article>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 font-bold text-slate-900">{value}</dd></div>; }
function NumberField({ label, value, min, max, onChange }: { label: string; value?: number; min?: number; max?: number; onChange: (value: number) => void }) { return <label className="text-xs font-semibold text-slate-600">{label}<input type="number" step="0.01" min={min} max={max} value={value ?? ""} onChange={(event) => { const next = Number(event.target.value); if (Number.isFinite(next)) onChange(next); }} className="mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" /></label>; }
