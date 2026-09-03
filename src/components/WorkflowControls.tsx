"use client";

import { useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";

const actionLabels = {
  WAITING_FOR_LOADING: "Confirm Package Loaded",
  WAITING_FOR_UNLOADING: "Confirm Package Received"
} as const;

const helperText = {
  WAITING_FOR_LOADING:
    "Confirm after the package has been placed securely on the robot.",
  WAITING_FOR_UNLOADING:
    "Confirm after the receiver has removed the package from the robot."
} as const;

export default function WorkflowControls() {
  const {
    activeTask,
    queuedTasks,
    failedTasks,
    robot,
    advanceRobotWorkflow,
    recoverRobot,
    backendOnline
    ,emergencyStop
  } = useDeliveryApi();

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const status = activeTask?.status;

  const action =
    status && status in actionLabels
      ? actionLabels[
          status as keyof typeof actionLabels
        ]
      : undefined;

  const helper =
    status && status in helperText
      ? helperText[
          status as keyof typeof helperText
        ]
      : undefined;

  const navigationMessage =
    status === "GOING_TO_PICKUP"
      ? "Robot is navigating to the pickup station."
      : status === "DELIVERING"
        ? "Robot is delivering the package to its destination."
        : undefined;

  async function run(
    actionFn: () => Promise<void>,
    success: string
  ) {
    setBusy(true);
    setMessage("");

    try {
      await actionFn();
      setMessage(success);
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Action failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
          Live Delivery Workflow
        </p>
        <h2 className="mt-1 font-semibold text-slate-900">
          Mission Control
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Monitor autonomous navigation and confirm package
          loading or unloading when operator action is required.
        </p>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {action && (
          <button
            type="button"
            onClick={() =>
              void run(
                advanceRobotWorkflow,
                status === "WAITING_FOR_LOADING"
                  ? "Package loading confirmed."
                  : "Package receipt confirmed."
              )
            }
            disabled={
              busy ||
              !backendOnline ||
              !robot.online
              || emergencyStop?.latched
            }
            className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Processing..." : action}
          </button>
        )}

        {navigationMessage && (
          <span className="rounded-xl bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
            {navigationMessage}
          </span>
        )}

        {!robot.online && (
          <span className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
            Robot is offline — waiting for the ROS Web
            Bridge connection.
          </span>
        )}

        {emergencyStop?.latched && <span className="rounded-xl bg-red-100 px-4 py-3 text-sm font-bold text-red-800">Motion controls disabled while Emergency Stop is latched.</span>}

        {robot.state === "ERROR" && robot.online && (
          <button
            type="button"
            onClick={() =>
              void run(
                recoverRobot,
                "Robot recovered to IDLE."
              )
            }
            disabled={busy || !backendOnline}
            className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Recovering..." : "Recover Robot"}
          </button>
        )}

        {!activeTask &&
          queuedTasks.length === 0 &&
          robot.state === "IDLE" && (
            <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              Robot is IDLE — create a delivery to begin.
            </span>
          )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
          Queued: {queuedTasks.length}
        </span>
        <span className="rounded-lg bg-red-50 px-3 py-2 text-red-700">
          Failed: {failedTasks.length}
        </span>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-slate-600">
          Robot: {robot.state}
        </span>
      </div>

      {helper && (
        <p className="mt-3 text-xs leading-5 text-slate-500">
          {helper}
        </p>
      )}

      {message && (
        <p
          aria-live="polite"
          className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"
        >
          {message}
        </p>
      )}
    </section>
  );
}
