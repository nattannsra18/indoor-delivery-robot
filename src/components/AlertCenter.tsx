"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { operationalText } from "@/lib/i18n";
import { adminUiText } from "@/lib/i18n";
import * as api from "@/lib/api";
import { Alert } from "@/types";

export default function AlertCenter() {
  const { t, locale } = useLocale();
  const copy = operationalText[locale];
  const ui = adminUiText[locale];
  const { user, loseSession } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const count = useMemo(() => alerts.filter((item) => item.active && !item.acknowledged).length, [alerts]);
  const criticalCount = useMemo(() => alerts.filter((item) => item.active && item.severity === "CRITICAL").length, [alerts]);
  const warningCount = useMemo(() => alerts.filter((item) => item.active && item.severity !== "CRITICAL").length, [alerts]);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    panelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
      if (event.key !== "Tab" || !panelRef.current) return;
      const controls = [...panelRef.current.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => { window.removeEventListener("keydown", handleKey); trigger?.focus(); };
  }, [open]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    let active = true;
    void api.getActiveAlerts().then((value) => {
      if (active) setAlerts(value);
    }).catch((reason) => {
      if (!active) return;
      if (reason instanceof api.ApiError && reason.status === 401) {
        loseSession();
      } else {
        setError(copy.alertsUnavailable);
      }
    });
    const websocket = new WebSocket(`${api.WS_BASE_URL}/ws/dashboard`);
    websocket.onmessage = (event) => {
      if (!active) return;
      try {
        const message = JSON.parse(event.data) as { type?: string; alerts?: Alert[]; alert?: Alert };
        if (message.type === "alert_snapshot" && message.alerts) setAlerts(message.alerts);
        if (message.type === "alert_changed" && message.alert) {
          setAlerts((current) => {
            const remaining = current.filter((item) => item.id !== message.alert?.id);
            return message.alert?.active ? [message.alert, ...remaining] : remaining;
          });
        }
      } catch { /* Ignore malformed server messages. */ }
    };
    websocket.onclose = (event) => {
      if (active && event.code === 1008) loseSession();
    };
    return () => {
      active = false;
      websocket.close();
    };
  }, [copy.alertsUnavailable, loseSession, user?.role]);

  if (user?.role !== "ADMIN") return null;
  async function act(alert: Alert, action: "ack" | "resolve") {
    try {
      const changed = action === "ack" ? await api.acknowledgeAlert(alert.id) : await api.resolveAlert(alert.id);
      setAlerts((current) => changed.active
        ? current.map((item) => item.id === changed.id ? changed : item)
        : current.filter((item) => item.id !== changed.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : copy.alertActionFailed); }
  }
  return (
    <div className="relative mb-5 flex justify-end">
      <button ref={triggerRef} type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-haspopup="dialog" className={`flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition ${count > 0 ? "border-red-200 bg-white text-slate-900 hover:border-red-300" : "border-slate-200 bg-white text-slate-700 hover:border-blue-200"}`}>
        <svg className="h-5 w-5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>
        {copy.alerts} {count > 0 && <span className="grid min-w-6 place-items-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs text-white">{count}</span>}
      </button>
      {open && <><button type="button" aria-label={ui.closeAlerts} onClick={() => setOpen(false)} className="fixed inset-0 z-40 cursor-default bg-slate-950/10 backdrop-blur-[1px]" /><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="alert-center-title" className="fixed inset-x-3 top-20 z-50 mx-auto max-h-[calc(100dvh-6rem)] w-auto max-w-xl overflow-y-auto rounded-3xl border border-slate-200 bg-white shadow-2xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-14 sm:mx-0 sm:w-[34rem]">
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{ui.liveOperations}</p><h2 id="alert-center-title" className="mt-1 text-lg font-bold text-slate-950">{ui.alertCenter}</h2><p className="mt-1 text-sm text-slate-500">{ui.alertSummary.replace("{count}", String(alerts.length))}</p></div><button type="button" onClick={() => setOpen(false)} aria-label={ui.closeAlerts} className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-xl text-slate-500 hover:bg-slate-200">×</button></div>
          <div className="mt-4 grid grid-cols-3 gap-2"><AlertCount label={ui.critical} value={criticalCount} tone="red"/><AlertCount label={ui.warnings} value={warningCount} tone="amber"/><AlertCount label={ui.unacknowledged} value={count} tone="blue"/></div>
        </div>
        <div className="space-y-3 p-4">{error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}{alerts.length === 0 ? <div className="py-10 text-center"><span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-600">✓</span><p className="mt-4 font-semibold text-slate-900">{t("noActiveAlerts")}</p><p className="mt-1 text-sm text-slate-500">{ui.noActiveAlertsHelp}</p></div> : alerts.map((alert) =>
          <article key={alert.id} className={`rounded-2xl border p-4 ${alert.severity === "CRITICAL" ? "border-red-200 bg-red-50/60" : "border-amber-200 bg-amber-50/60"}`}>
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${alert.severity === "CRITICAL" ? "bg-red-500" : "bg-amber-500"}`}/><strong className="text-sm text-slate-950">{alert.title}</strong></div><p className="mt-2 text-sm leading-5 text-slate-700">{alert.message}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${alert.severity === "CRITICAL" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{alert.severity}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200/70 pt-3 text-xs text-slate-500"><span className="font-semibold text-slate-700">{alert.robot_id ?? copy.system}</span><span>{new Date(alert.latest_occurrence_at).toLocaleString(locale === "th" ? "th-TH" : "en-US")}</span><span>{ui.occurrences.replace("{count}", String(alert.occurrence_count))}</span>{alert.acknowledged && <span className="text-emerald-700">✓ {ui.acknowledged}</span>}</div>
            <div className="mt-3 flex gap-2" aria-label={ui.alertActions}>{!alert.acknowledged && <button onClick={() => void act(alert, "ack")} className="min-h-9 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-700">{t("acknowledge")}</button>}<button onClick={() => void act(alert, "resolve")} className="min-h-9 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">{t("resolve")}</button></div>
          </article>)}
        </div>
      </section></>}
    </div>
  );
}

function AlertCount({label,value,tone}:{label:string;value:number;tone:"red"|"amber"|"blue"}) {
  const colors={red:"bg-red-50 text-red-700",amber:"bg-amber-50 text-amber-700",blue:"bg-blue-50 text-blue-700"};
  return <div className={`rounded-xl px-3 py-2 ${colors[tone]}`}><p className="text-lg font-bold">{value}</p><p className="text-[11px] font-semibold">{label}</p></div>;
}
