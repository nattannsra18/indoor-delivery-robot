"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import * as api from "@/lib/api";
import { useLocale } from "@/context/LocaleContext";
import { emergencyStateLabel } from "@/lib/i18n";

export default function EmergencyStopControl() {
  const { user } = useAuth();
  const { robot, emergencyStop, refreshAll } = useDeliveryApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { t, locale } = useLocale();
  const state = emergencyStop?.state ?? "NORMAL";
  const pending = state === "STOP_REQUESTED" || state === "RESET_REQUESTED";
  async function activate() {
    setBusy(true); setError("");
    try { await api.activateEmergencyStop(robot.id); await refreshAll(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("emergencyStopFailed")); }
    finally { setBusy(false); }
  }
  async function reset() {
    if (!window.confirm(t("resetConfirmation"))) return;
    setBusy(true); setError("");
    try { await api.resetEmergencyStop(robot.id); await refreshAll(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("resetFailed")); }
    finally { setBusy(false); }
  }
  return <section className={`rounded-3xl border p-5 shadow-sm ${emergencyStop?.latched ? "border-red-300 bg-red-50" : "border-slate-200 bg-white"}`}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${emergencyStop?.latched ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}><svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v5M12 17h.01" strokeLinecap="round"/><path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg></span><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-red-700">{t("emergencyStop")}</p><div className="mt-1 flex items-center gap-2"><h2 className="text-lg font-bold text-slate-950">{emergencyStateLabel(state, locale)}</h2><span className={`h-2.5 w-2.5 rounded-full ${emergencyStop?.latched ? "bg-red-500" : "bg-emerald-500"}`}/></div><p className="mt-1 text-xs leading-5 text-slate-500">{t("emergencySafetyNotice")}</p>{emergencyStop?.failure_detail && <p className="mt-2 text-sm font-semibold text-red-800">{emergencyStop.failure_detail}</p>}</div></div>
      {user?.role === "ADMIN" && <div className="flex gap-2">{!emergencyStop?.latched ? <button disabled={busy || pending} onClick={() => void activate()} className="min-h-11 rounded-xl bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-50">{t("emergencyStop")}</button> : <button disabled={busy || pending} onClick={() => void reset()} className="min-h-11 rounded-xl border-2 border-red-700 bg-white px-5 py-3 font-bold text-red-800 disabled:opacity-50">{t("resetEmergencyStop")}</button>}</div>}
    </div>{error && <p className="mt-3 text-sm text-red-800" aria-live="polite">{error}</p>}
  </section>;
}
