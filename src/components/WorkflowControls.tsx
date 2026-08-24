"use client";

import { useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";

const actionLabels = {
  GOING_TO_PICKUP: "Simulate Nav2 arrival at Pickup",
  WAITING_FOR_LOADING: "Simulate physical CONFIRM — Package Loaded",
  DELIVERING: "Simulate Nav2 arrival at Destination",
  WAITING_FOR_UNLOADING: "Simulate physical CONFIRM — Package Received"
} as const;

const helperText = {
  GOING_TO_PICKUP: "POSTs ARRIVED_PICKUP to FastAPI.",
  WAITING_FOR_LOADING: "POSTs CONFIRM_LOADED to FastAPI, representing the sender pressing the robot button.",
  DELIVERING: "POSTs ARRIVED_DESTINATION to FastAPI.",
  WAITING_FOR_UNLOADING: "POSTs CONFIRM_RECEIVED to FastAPI, representing the receiver pressing the same button."
} as const;

export default function WorkflowControls() {
  const { activeTask, queuedTasks, robot, advanceRobotWorkflow, resetDemo, backendOnline } = useDeliveryApi();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const status = activeTask?.status;
  const action = status && status in actionLabels
    ? actionLabels[status as keyof typeof actionLabels]
    : undefined;
  const helper = status && status in helperText
    ? helperText[status as keyof typeof helperText]
    : undefined;

  async function handleAdvance() {
    setBusy(true);
    setMessage("");
    try {
      await advanceRobotWorkflow();
      setMessage("FastAPI accepted the workflow event and the UI refreshed from the backend.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Workflow event failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setMessage("");
    try {
      await resetDemo();
      setMessage("Backend demo data reset successfully.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Reset failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Phase 2.1 API Control</p>
          <h2 className="mt-1 font-semibold text-slate-900">FastAPI Delivery Workflow</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            These demo buttons now send real REST requests to FastAPI. Later Nav2, ESP32 and MQTT will produce the same events automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={busy || !backendOnline}
          className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Reset backend demo
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {action && (
          <button
            type="button"
            onClick={() => void handleAdvance()}
            disabled={busy || !backendOnline}
            className="min-h-11 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Sending event..." : action}
          </button>
        )}

        {!activeTask && queuedTasks.length === 0 && (
          <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Robot is {robot.state} — create a delivery to begin.
          </span>
        )}

        {!activeTask && queuedTasks.length > 0 && (
          <span className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            {queuedTasks.length} task(s) are queued. FastAPI dispatches queued work automatically when the robot becomes IDLE.
          </span>
        )}
      </div>

      {helper && <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>}
      {message && <p aria-live="polite" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">{message}</p>}
    </section>
  );
}
