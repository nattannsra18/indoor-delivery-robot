"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/lib/api";
import { Alert } from "@/types";

export default function AlertCenter() {
  const { user, loseSession } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const count = useMemo(() => alerts.filter((item) => item.active && !item.acknowledged).length, [alerts]);

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
        setError("Alerts unavailable");
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
  }, [loseSession, user?.role]);

  if (user?.role !== "ADMIN") return null;
  async function act(alert: Alert, action: "ack" | "resolve") {
    try {
      const changed = action === "ack" ? await api.acknowledgeAlert(alert.id) : await api.resolveAlert(alert.id);
      setAlerts((current) => changed.active
        ? current.map((item) => item.id === changed.id ? changed : item)
        : current.filter((item) => item.id !== changed.id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Alert action failed"); }
  }
  return (
    <div className="relative mb-5 flex justify-end">
      <button type="button" onClick={() => setOpen(!open)} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold shadow-sm">
        🔔 Alerts {count > 0 && <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{count}</span>}
      </button>
      {open && <section className="absolute right-0 top-12 z-50 max-h-[70vh] w-[min(92vw,30rem)] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <h2 className="font-semibold">Active Alert Center</h2>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
        <div className="mt-3 space-y-3">{alerts.length === 0 ? <p className="text-sm text-slate-500">No active alerts.</p> : alerts.map((alert) =>
          <article key={alert.id} className={`rounded-xl border p-3 ${alert.severity === "CRITICAL" ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex justify-between gap-3"><strong className="text-sm">{alert.title}</strong><span className="text-xs font-bold">{alert.severity}</span></div>
            <p className="mt-1 text-sm">{alert.message}</p>
            <p className="mt-2 text-xs text-slate-500">{alert.robot_id ?? "System"} · {new Date(alert.latest_occurrence_at).toLocaleString()} · ×{alert.occurrence_count}</p>
            <div className="mt-2 flex gap-2">{!alert.acknowledged && <button onClick={() => void act(alert, "ack")} className="rounded-lg bg-slate-900 px-2 py-1 text-xs text-white">Acknowledge</button>}<button onClick={() => void act(alert, "resolve")} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">Resolve</button></div>
          </article>)}
        </div>
      </section>}
    </div>
  );
}
