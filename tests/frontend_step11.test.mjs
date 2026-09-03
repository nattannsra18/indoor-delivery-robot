import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTaskEtaDisplay,
  formatEtaDuration
} from "../src/lib/taskEta.ts";

const task = (status) => ({
  id: "TASK-101",
  status,
  createdAt: "2026-09-04T10:00:00Z",
  pickupStationId: "A",
  destinationStationId: "B",
  progress: 20
});

const estimate = {
  taskId: "TASK-101",
  status: "QUEUED",
  queuePosition: 2,
  pickupEtaSeconds: 480,
  destinationEtaSeconds: 720,
  generatedAt: "2026-09-04T10:00:00Z",
  availability: "AVAILABLE"
};

test("QUEUED shows global position and pickup/destination estimates", () => {
  const display = buildTaskEtaDisplay(task("QUEUED"), estimate);
  assert.equal(display.queuePosition, 2);
  assert.equal(display.pickup.state, "estimate");
  assert.equal(display.destination.state, "estimate");
  assert.equal(display.pickup.seconds, 480);
  assert.equal(display.destination.seconds, 720);
});

test("missing queued estimate is unavailable and never zero", () => {
  const display = buildTaskEtaDisplay(task("QUEUED"), undefined);
  assert.equal(display.queuePosition, undefined);
  assert.equal(display.pickup.state, "unavailable");
  assert.equal(display.destination.state, "unavailable");
});

test("GOING_TO_PICKUP uses the backend-fresh pickup and destination projection", () => {
  const display = buildTaskEtaDisplay(
    task("GOING_TO_PICKUP"),
    {
      ...estimate,
      status: "GOING_TO_PICKUP",
      queuePosition: undefined,
      pickupEtaSeconds: 37,
      destinationEtaSeconds: 70
    }
  );
  assert.equal(display.queuePosition, undefined);
  assert.equal(display.pickup.state, "estimate");
  assert.equal(display.pickup.seconds, 37);
  assert.equal(display.destination.seconds, 70);
});

test("DELIVERING uses the backend-fresh destination projection", () => {
  const display = buildTaskEtaDisplay(
    task("DELIVERING"),
    {
      ...estimate,
      status: "DELIVERING",
      queuePosition: undefined,
      pickupEtaSeconds: undefined,
      destinationEtaSeconds: 45
    }
  );
  assert.equal(display.pickup.state, "picked-up");
  assert.equal(display.destination.state, "estimate");
  assert.equal(display.destination.seconds, 45);
});

test("human confirmation statuses show arrived semantics", () => {
  const loading = buildTaskEtaDisplay(task("WAITING_FOR_LOADING"), undefined);
  assert.equal(loading.pickup.state, "arrived");
  assert.equal(loading.destination.state, "unavailable");
  const unloading = buildTaskEtaDisplay(task("WAITING_FOR_UNLOADING"), undefined);
  assert.equal(unloading.destination.state, "awaiting-confirmation");
});

test("terminal tasks never display stale estimates", () => {
  for (const status of ["COMPLETED", "FAILED", "CANCELLED"]) {
    const display = buildTaskEtaDisplay(task(status), estimate);
    assert.equal(display.queuePosition, undefined);
    assert.notEqual(display.destination.state, "estimate");
  }
});

test("arrival ETA has no browser feedback input or fallback", () => {
  assert.equal(buildTaskEtaDisplay.length, 2);
  for (const status of ["GOING_TO_PICKUP", "DELIVERING"]) {
    const display = buildTaskEtaDisplay(
      task(status),
      undefined
    );
    const value = status === "GOING_TO_PICKUP"
      ? display.pickup
      : display.destination;
    assert.equal(value.state, "unavailable");
  }
});

test("wrong-task or wrong-status backend estimates are not displayed", () => {
  const wrongTask = buildTaskEtaDisplay(
    task("GOING_TO_PICKUP"),
    { ...estimate, taskId: "TASK-OTHER", status: "GOING_TO_PICKUP", pickupEtaSeconds: 45 }
  );
  const wrongStatus = buildTaskEtaDisplay(
    task("DELIVERING"),
    { ...estimate, status: "GOING_TO_PICKUP", destinationEtaSeconds: 45 }
  );
  assert.equal(wrongTask.pickup.state, "unavailable");
  assert.equal(wrongStatus.destination.state, "unavailable");
});

test("invalid backend ETA values are not rendered as estimates", () => {
  for (const seconds of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const display = buildTaskEtaDisplay(
      task("DELIVERING"),
      { ...estimate, status: "DELIVERING", destinationEtaSeconds: seconds }
    );
    assert.equal(display.destination.state, "unavailable");
  }
  assert.equal(formatEtaDuration(-1), "Unavailable");
  assert.equal(formatEtaDuration(Number.NaN), "Unavailable");
});

test("pending to active mapping removes queue position", () => {
  const pending = buildTaskEtaDisplay(task("QUEUED"), estimate);
  const active = buildTaskEtaDisplay(
    task("GOING_TO_PICKUP"),
    {
      ...estimate,
      status: "GOING_TO_PICKUP",
      queuePosition: undefined,
      pickupEtaSeconds: 30
    }
  );
  assert.equal(pending.queuePosition, 2);
  assert.equal(active.queuePosition, undefined);
  assert.equal(active.pickup.state, "estimate");
});
