"use client";

import { useMockDelivery } from "@/context/MockDeliveryContext";

const actionLabels = {
  GOING_TO_PICKUP: "Simulate arrival at Pickup",
  WAITING_FOR_LOADING: "Simulate physical CONFIRM — Package Loaded",
  DELIVERING: "Simulate arrival at Destination",
  WAITING_FOR_UNLOADING: "Simulate physical CONFIRM — Package Received"
} as const;

const helperText = {
  GOING_TO_PICKUP: "Represents Nav2 reaching the pickup station.",
  WAITING_FOR_LOADING: "Represents the sender placing the package and pressing the robot CONFIRM button.",
  DELIVERING: "Represents Nav2 reaching the destination station.",
  WAITING_FOR_UNLOADING: "Represents the receiver taking the package and pressing the same CONFIRM button."
} as const;

export default function WorkflowControls() {
  const {
    activeTask,
    queuedTasks,
    robot,
    startNextTask,
    advanceRobotWorkflow,
    resetDemo
  } = useMockDelivery();

  const status = activeTask?.status;
  const action = status && status in actionLabels
    ? actionLabels[status as keyof typeof actionLabels]
    : undefined;
  const helper = status && status in helperText
    ? helperText[status as keyof typeof helperText]
    : undefined;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">Phase 1.1 Demo Control</p>
          <h2 className="mt-1 font-semibold text-slate-900">Mock Robot Workflow</h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Use these buttons to simulate the events that will later come from Nav2, ESP32, MQTT and the physical CONFIRM button.
          </p>
        </div>
        <button
          type="button"
          onClick={resetDemo}
          className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          Reset demo
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {robot.state === "IDLE" && queuedTasks.length > 0 && (
          <button
            type="button"
            onClick={startNextTask}
            className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Simulate auto-dispatch next task
          </button>
        )}

        {action && (
          <button
            type="button"
            onClick={advanceRobotWorkflow}
            className="min-h-11 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white hover:bg-slate-800"
          >
            {action}
          </button>
        )}

        {!activeTask && queuedTasks.length === 0 && (
          <span className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
            Robot is IDLE — create a delivery to begin the demo.
          </span>
        )}
      </div>

      {helper && <p className="mt-3 text-xs leading-5 text-slate-500">{helper}</p>}
    </section>
  );
}
