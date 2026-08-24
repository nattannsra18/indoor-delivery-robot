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
  GOING_TO_PICKUP: "ARRIVED_PICKUP is validated by the Phase 4 state machine.",
  WAITING_FOR_LOADING: "CONFIRM_LOADED represents the sender pressing the physical robot button.",
  DELIVERING: "ARRIVED_DESTINATION represents Nav2 reporting that the destination goal was reached.",
  WAITING_FOR_UNLOADING: "CONFIRM_RECEIVED represents the receiver pressing the same physical button."
} as const;

export default function WorkflowControls() {
  const {
    activeTask,
    queuedTasks,
    failedTasks,
    robot,
    advanceRobotWorkflow,
    failActiveTask,
    setRobotOnlineState,
    recoverRobot,
    resetDemo,
    backendOnline
  } = useDeliveryApi();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const status = activeTask?.status;
  const action = status && status in actionLabels
    ? actionLabels[status as keyof typeof actionLabels]
    : undefined;
  const helper = status && status in helperText
    ? helperText[status as keyof typeof helperText]
    : undefined;
  const canSimulateFailure = status === "GOING_TO_PICKUP" || status === "DELIVERING";

  async function run(actionFn: () => Promise<void>, success: string) {
    setBusy(true);
    setMessage("");
    try {
      await actionFn();
      setMessage(success);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Phase 4 Task State Machine</p>
          <h2 className="mt-1 font-semibold text-slate-900">Delivery Workflow Control</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            FastAPI now validates every transition, auto-dispatches queued work, records task history and handles failure/offline recovery.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run(resetDemo, "Backend demo data reset successfully.")}
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
            onClick={() => void run(advanceRobotWorkflow, "State transition accepted and saved to PostgreSQL.")}
            disabled={busy || !backendOnline || !robot.online}
            className="min-h-11 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Processing..." : action}
          </button>
        )}

        {canSimulateFailure && (
          <button
            type="button"
            onClick={() => void run(failActiveTask, "Navigation failure recorded. Task is FAILED and robot entered ERROR.")}
            disabled={busy || !backendOnline || !robot.online}
            className="min-h-11 rounded-xl border border-red-200 px-5 py-3 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Simulate Navigation Failure
          </button>
        )}

        {robot.online ? (
          <button
            type="button"
            onClick={() => void run(() => setRobotOnlineState(false), "Robot marked OFFLINE. Active work is failed safely.")}
            disabled={busy || !backendOnline}
            className="min-h-11 rounded-xl border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Simulate Robot Offline
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void run(() => setRobotOnlineState(true), "Robot is ONLINE. The oldest queued task was dispatched if available.")}
            disabled={busy || !backendOnline}
            className="min-h-11 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bring Robot Online
          </button>
        )}

        {robot.state === "ERROR" && robot.online && (
          <button
            type="button"
            onClick={() => void run(recoverRobot, "Robot recovered to IDLE and queue dispatch resumed.")}
            disabled={busy || !backendOnline}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Recover Robot
          </button>
        )}

        {!activeTask && queuedTasks.length === 0 && robot.state === "IDLE" && (
          <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Robot is IDLE — create a delivery to begin.
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">Queued: {queuedTasks.length}</span>
        <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">Failed: {failedTasks.length}</span>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">Robot: {robot.state}</span>
      </div>

      {helper && <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>}
      {message && (
        <p aria-live="polite" className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {message}
        </p>
      )}
    </section>
  );
}
