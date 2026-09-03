import assert from "node:assert/strict";
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
