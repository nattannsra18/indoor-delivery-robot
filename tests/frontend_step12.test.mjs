import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  allowedPriority,
  taskCreationAction
} from "../src/lib/taskCreation.ts";

test("creation always requires a valid review before POST", () => {
  assert.equal(taskCreationAction(false, false, false), "invalid");
  assert.equal(taskCreationAction(true, false, false), "review");
  assert.equal(taskCreationAction(true, true, false), "create");
});

test("submitting state blocks duplicate creation", () => {
  assert.equal(taskCreationAction(true, true, true), "invalid");
});

test("USER priority is fixed to normal even if a caller requests high", () => {
  assert.equal(allowedPriority("USER", "HIGH"), "NORMAL");
  assert.equal(allowedPriority(undefined, "HIGH"), "NORMAL");
});

test("ADMIN may select either queue priority", () => {
  assert.equal(allowedPriority("ADMIN", "HIGH"), "HIGH");
  assert.equal(allowedPriority("ADMIN", "NORMAL"), "NORMAL");
});

test("ADMIN and USER consume the backend canonical queue estimate", () => {
  const contextSource = readFileSync(
    new URL("../src/context/ApiDeliveryContext.tsx", import.meta.url),
    "utf8"
  );
  const tasksSource = readFileSync(
    new URL("../src/app/tasks/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(contextSource, /const estimates = await api\.getTaskEstimates\(\)/);
  assert.doesNotMatch(
    contextSource,
    /user\?\.role === "USER"\s*\?\s*await api\.getTaskEstimates/
  );
  assert.doesNotMatch(tasksSource, /buildQueueEstimates/);
  assert.match(tasksSource, /taskEstimateById\.get\(task\.id\)/);
});
