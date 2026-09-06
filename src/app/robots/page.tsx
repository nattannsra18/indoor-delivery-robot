"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ActionToast from "@/components/ActionToast";
import PageHeader from "@/components/PageHeader";
import { useLocale } from "@/context/LocaleContext";
import { approveRobotEnrollment, getRobotEnrollments, getRobotRegistry, revokeRobotCredential } from "@/lib/api";
import { formatDate, robotRegistryText } from "@/lib/i18n";
import type { RobotEnrollment, RobotRegistryEntry } from "@/types";

type Dialog = { kind: "approve"; enrollment: RobotEnrollment } | { kind: "revoke"; robot: RobotRegistryEntry };

export default function RobotRegistryPage() {
  const { locale } = useLocale();
  const copy = robotRegistryText[locale];
  const [enrollments, setEnrollments] = useState<RobotEnrollment[]>([]);
  const [robots, setRobots] = useState<RobotRegistryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState<Dialog>();
  const [pairingCode, setPairingCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [toast, setToast] = useState<{ kind: "success" | "error"; title: string; body: string }>();
  const dialogRef = useRef<HTMLElement>(null);

  const load = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const [nextEnrollments, nextRobots] = await Promise.all([getRobotEnrollments(), getRobotRegistry()]);
      setEnrollments(nextEnrollments);
      setRobots(nextRobots);
      setLoadError("");
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : copy.loadFailed);
    } finally {
      if (initial) setLoading(false);
    }
  }, [copy.loadFailed]);

  useEffect(() => {
    void load(true);
    setCurrentTime(Date.now());
    const interval = window.setInterval(() => {
      setCurrentTime(Date.now());
      void load(false);
    }, 5000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled])") ?? []);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setDialog(undefined);
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [busy, dialog]);

  const pairingRequests = useMemo(
    () => enrollments.filter((item) => item.status === "PENDING" || item.status === "UNPAIRED"),
    [enrollments],
  );

  async function submitDialog() {
    if (!dialog) return;
    setBusy(true);
    setToast(undefined);
    try {
      if (dialog.kind === "approve") {
        await approveRobotEnrollment(dialog.enrollment.id, pairingCode);
        setToast({ kind: "success", title: copy.approvedTitle, body: copy.approvedBody });
      } else {
        await revokeRobotCredential(dialog.robot.id);
        setToast({ kind: "success", title: copy.revokedTitle, body: copy.revokedBody });
      }
      setDialog(undefined);
      setPairingCode("");
      await load(false);
    } catch (reason) {
      setToast({
        kind: "error",
        title: dialog.kind === "approve" ? copy.approveFailedTitle : copy.revokeFailedTitle,
        body: reason instanceof Error ? reason.message : copy.loadFailed,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {toast && <ActionToast {...toast} closeLabel={copy.close} onClose={() => setToast(undefined)} />}
      <PageHeader title={copy.title} description={copy.description} />

      {loadError && <div role="alert" className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{loadError}</span><button type="button" onClick={() => void load(true)} className="rounded-xl bg-white px-4 py-2 font-bold shadow-sm">{copy.retry}</button></div>}

      {loading ? <div className="mt-6 grid gap-4" aria-busy="true"><span className="sr-only">{copy.loading}</span>{[0, 1, 2].map((item) => <div key={item} className="h-36 animate-pulse rounded-3xl bg-slate-200" />)}</div> : (
        <div className="mt-6 space-y-6">
          <RegistrySection title={copy.pendingTitle} help={copy.pendingHelp} count={copy.pendingCount.replace("{count}", String(pairingRequests.length))}>
            {pairingRequests.length === 0 ? <Empty title={copy.emptyPending} help={copy.emptyPendingHelp} /> : (
              <ul className="divide-y divide-slate-100">
                {pairingRequests.map((item) => {
                  const expired = currentTime > 0 && Date.parse(item.expiresAt) <= currentTime;
                  return <li key={item.id} className="grid gap-5 px-5 py-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center md:px-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{item.displayName}</h3><StatusBadge value={item.status === "PENDING" ? copy.pending : copy.awaitingClaim} tone={item.status === "PENDING" ? "amber" : "blue"} /></div>
                      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
                        <Detail label={copy.serial} value={item.serialNumber} />
                        <Detail label={copy.fingerprint} value={item.fingerprintSha256} mono />
                        <Detail label={copy.agent} value={`${item.agentVersion} · ROS ${item.rosDistro}`} />
                        <Detail label={copy.profile} value={item.profileVersion} />
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-2">{item.capabilities.map((capability) => <span key={capability} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{capability}</span>)}</div>
                      <p className={`mt-3 text-xs ${expired ? "font-bold text-rose-600" : "text-slate-400"}`}>{copy.requested} {formatDate(item.createdAt, locale)} · {expired ? copy.expired : `${copy.expires} ${formatDate(item.expiresAt, locale)}`}</p>
                    </div>
                    {item.status === "PENDING" && <button type="button" disabled={expired} onClick={() => { setPairingCode(""); setDialog({ kind: "approve", enrollment: item }); }} className="min-h-11 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40">{copy.approve}</button>}
                  </li>;
                })}
              </ul>
            )}
          </RegistrySection>

          <RegistrySection title={copy.robotsTitle} help={copy.robotsHelp} count={copy.robotCount.replace("{count}", String(robots.length))}>
            {robots.length === 0 ? <Empty title={copy.emptyRobots} help={copy.emptyRobotsHelp} /> : <ul className="grid gap-4 p-5 md:grid-cols-2 md:p-6">
              {robots.map((robot) => <li key={robot.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-bold text-slate-950">{robot.displayName}</h3><p className="mt-1 truncate font-mono text-xs text-slate-400">{robot.id}</p></div><StatusBadge value={robot.online ? copy.online : copy.offline} tone={robot.online ? "green" : "slate"} /></div>
                <dl className="mt-5 grid grid-cols-2 gap-3">
                  <Detail label={copy.enrollment} value={enrollmentLabel(robot.enrollmentStatus, copy)} />
                  <Detail label={copy.readiness} value={readinessLabel(robot.readinessStatus, copy)} />
                  <Detail label={copy.serial} value={robot.serialNumber ?? copy.unknown} />
                  <Detail label={copy.credential} value={robot.credentialVersion ? copy.version.replace("{value}", String(robot.credentialVersion)) : copy.noCredential} />
                  <Detail label={copy.agent} value={robot.agentVersion ? `${robot.agentVersion} · ROS ${robot.rosDistro ?? copy.unknown}` : copy.unknown} />
                  <Detail label={copy.profile} value={robot.profileVersion ?? copy.unknown} />
                </dl>
                {robot.capabilities.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{robot.capabilities.map((capability) => <span key={capability} className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{capability}</span>)}</div>}
                {robot.credentialVersion && !robot.credentialRevoked && <button type="button" onClick={() => setDialog({ kind: "revoke", robot })} className="mt-5 min-h-10 rounded-xl border border-rose-200 px-4 py-2 text-sm font-bold text-rose-700 hover:bg-rose-50">{copy.revoke}</button>}
              </li>)}
            </ul>}
          </RegistrySection>
          <aside className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">{copy.protocolNote}</aside>
        </div>
      )}

      {dialog && <div role="presentation" className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/45 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setDialog(undefined); }}>
        <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="robot-dialog-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
          <h2 id="robot-dialog-title" className="text-xl font-bold text-slate-950">{dialog.kind === "approve" ? copy.approve : copy.revokeTitle}</h2>
          {dialog.kind === "approve" ? <>
            <p className="mt-2 text-sm text-slate-600">{dialog.enrollment.displayName} · {dialog.enrollment.serialNumber}</p>
            <label className="mt-5 block text-sm font-bold text-slate-800" htmlFor="pairing-code">{copy.code}</label>
            <input id="pairing-code" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, ""))} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-mono text-lg tracking-[0.25em] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
            <p className="mt-2 text-xs text-slate-500">{copy.codeHelp}</p>
          </> : <p className="mt-3 text-sm leading-6 text-slate-600">{copy.revokeBody}</p>}
          <div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy} onClick={() => setDialog(undefined)} className="min-h-11 rounded-xl border border-slate-200 px-5 text-sm font-bold text-slate-700">{copy.cancel}</button><button type="button" disabled={busy || (dialog.kind === "approve" && pairingCode.length !== 8)} onClick={() => void submitDialog()} className={`min-h-11 rounded-xl px-5 text-sm font-bold text-white disabled:opacity-40 ${dialog.kind === "approve" ? "bg-blue-600" : "bg-rose-600"}`}>{busy ? (dialog.kind === "approve" ? copy.approving : copy.revoking) : (dialog.kind === "approve" ? copy.confirmApprove : copy.confirmRevoke)}</button></div>
        </section>
      </div>}
    </>
  );
}

function RegistrySection({ title, help, count, children }: { title: string; help: string; count: string; children: React.ReactNode }) {
  return <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 md:px-6"><div><h2 className="text-lg font-bold text-slate-950">{title}</h2><p className="mt-1 text-sm text-slate-500">{help}</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">{count}</span></header>{children}</section>;
}

function Empty({ title, help }: { title: string; help: string }) { return <div className="px-6 py-12 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-slate-100 text-xl">◇</div><h3 className="mt-3 font-bold text-slate-900">{title}</h3><p className="mt-1 text-sm text-slate-500">{help}</p></div>; }
function Detail({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) { return <div className="min-w-0"><dt className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{label}</dt><dd title={value} className={`mt-1 truncate text-sm font-semibold text-slate-700 ${mono ? "font-mono" : ""}`}>{value}</dd></div>; }
function StatusBadge({ value, tone }: { value: string; tone: "green" | "amber" | "blue" | "slate" }) { const styles = { green: "bg-emerald-50 text-emerald-700", amber: "bg-amber-50 text-amber-700", blue: "bg-blue-50 text-blue-700", slate: "bg-slate-100 text-slate-600" }; return <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${styles[tone]}`}>{value}</span>; }
type StatusCopy = Record<"paired" | "revoked" | "pending" | "awaitingClaim" | "ready" | "degraded" | "notReady", string>;
function enrollmentLabel(status: RobotRegistryEntry["enrollmentStatus"], copy: StatusCopy) { return status === "PAIRED" ? copy.paired : status === "REVOKED" ? copy.revoked : status === "PENDING" ? copy.pending : copy.awaitingClaim; }
function readinessLabel(status: RobotRegistryEntry["readinessStatus"], copy: StatusCopy) { return status === "READY" ? copy.ready : status === "DEGRADED" ? copy.degraded : copy.notReady; }
