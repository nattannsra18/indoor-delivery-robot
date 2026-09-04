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
  return <section className={`rounded-2xl border p-5 ${emergencyStop?.latched ? "border-red-500 bg-red-50" : "border-slate-200 bg-white"}`}>
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><p className="text-xs font-bold uppercase text-red-700">{t("emergencyStop")}</p><h2 className="mt-1 text-lg font-bold">{emergencyStateLabel(state, locale)}</h2><p className="mt-1 text-xs text-slate-600">{t("emergencySafetyNotice")}</p>{emergencyStop?.failure_detail && <p className="mt-2 text-sm font-semibold text-red-800">{emergencyStop.failure_detail}</p>}</div>
      {user?.role === "ADMIN" && <div className="flex gap-2">{!emergencyStop?.latched ? <button disabled={busy || pending} onClick={() => void activate()} className="min-h-11 rounded-xl bg-red-700 px-5 py-3 font-bold text-white disabled:opacity-50">{t("emergencyStop")}</button> : <button disabled={busy || pending} onClick={() => void reset()} className="min-h-11 rounded-xl border-2 border-red-700 bg-white px-5 py-3 font-bold text-red-800 disabled:opacity-50">{t("resetEmergencyStop")}</button>}</div>}
    </div>{error && <p className="mt-3 text-sm text-red-800" aria-live="polite">{error}</p>}
  </section>;
}
