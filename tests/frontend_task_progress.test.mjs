import assert from "node:assert/strict";
import test from "node:test";

import { displayedTaskProgress } from "../src/lib/taskProgress.ts";

const task = (status, pickupDistanceMeters, deliveryDistanceMeters) => ({
  id: "TASK-ROUTE",
  status,
  progress: status === "DELIVERING" ? 70 : 20,
  pickupDistanceMeters,
  deliveryDistanceMeters
});

test("pickup progress follows matching Nav2 remaining distance", () => {
  assert.equal(displayedTaskProgress(task("GOING_TO_PICKUP", 10, 20), {
    taskId: "TASK-ROUTE",
    stage: "pickup",
    distanceRemaining: 5
  }), 18);
});

test("delivery progress follows matching Nav2 remaining distance", () => {
  assert.equal(displayedTaskProgress(task("DELIVERING", 10, 20), {
    taskId: "TASK-ROUTE",
    stage: "destination",
    distanceRemaining: 5
  }), 74);
});

test("progress rejects feedback for another task", () => {
  assert.equal(displayedTaskProgress(task("GOING_TO_PICKUP", 10, 20), {
    taskId: "TASK-OTHER",
    stage: "pickup",
    distanceRemaining: 0
  }), 20);
});
