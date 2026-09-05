import assert from "node:assert/strict";
import test from "node:test";

import {
  ACTIVE_TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  classifyMyDeliveries,
  dashboardRequestsForRole,
  myDeliveriesViewState,
  navigationForRole,
  routeAllowedForRole,
  taskStatusCounts
} from "../src/lib/roleDashboard.ts";

const task = (id, status, createdAt) => ({
  id,
  status,
  createdAt,
  pickupStationId: "A",
  destinationStationId: "B",
  progress: status === "COMPLETED" ? 100 : 20
});

test("ADMIN navigation exposes operational and system destinations", () => {
  const labels = navigationForRole("ADMIN").map((item) => item.label);
  assert.deepEqual(labels, [
    "Dashboard",
    "Create Delivery",
    "All Tasks",
    "Station Management",
    "Account Requests",
    "Notifications",
    "Audit Log"
  ]);
});

test("USER navigation excludes admin and system destinations", () => {
  const paths = navigationForRole("USER").map((item) => item.href);
  assert.deepEqual(paths, ["/", "/delivery", "/tasks", "/notifications"]);
  assert.equal(paths.includes("/robots"), false);
  assert.equal(paths.includes("/stations"), false);
  assert.equal(paths.includes("/audit"), false);
  assert.equal(paths.includes("/users"), false);
});

test("USER dashboard does not request admin-only emergency state", () => {
  assert.deepEqual(dashboardRequestsForRole("USER"), [
    "overview",
    "stations",
    "tasks"
  ]);
  assert.equal(
    dashboardRequestsForRole("ADMIN").includes("emergency-stop"),
    true
  );
});

test("active, pending and recent use real statuses without mutating input", () => {
  assert.deepEqual(ACTIVE_TASK_STATUSES, [
    "GOING_TO_PICKUP",
    "WAITING_FOR_LOADING",
    "DELIVERING",
    "WAITING_FOR_UNLOADING"
  ]);
  assert.deepEqual(TERMINAL_TASK_STATUSES, [
    "COMPLETED",
    "FAILED",
    "CANCELLED"
  ]);
  const tasks = [
    task("older", "COMPLETED", "2026-09-01T10:00:00Z"),
    task("active", "DELIVERING", "2026-09-02T10:00:00Z"),
    task("newer-pending", "QUEUED", "2026-09-04T10:00:00Z"),
    task("older-pending", "QUEUED", "2026-09-03T10:00:00Z"),
    task("newer-terminal", "FAILED", "2026-09-05T10:00:00Z")
  ];
  const originalOrder = tasks.map((item) => item.id);
  const result = classifyMyDeliveries(tasks);
  assert.equal(result.active?.id, "active");
  assert.deepEqual(result.pending.map((item) => item.id), [
    "newer-pending",
    "older-pending"
  ]);
  assert.deepEqual(result.recent.map((item) => item.id), [
    "newer-terminal",
    "older"
  ]);
  assert.equal(result.recent.some((item) => item.status === "QUEUED"), false);
  assert.equal(result.recent.every((item) =>
    TERMINAL_TASK_STATUSES.includes(item.status)), true);
  assert.deepEqual(tasks.map((item) => item.id), originalOrder);
});

test("dashboard counts use persisted task statuses", () => {
  const counts = taskStatusCounts([
    task("a", "GOING_TO_PICKUP", "2026-09-01T10:00:00Z"),
    task("b", "QUEUED", "2026-09-01T11:00:00Z"),
    task("c", "FAILED", "2026-09-01T12:00:00Z"),
    task("d", "COMPLETED", "2026-09-01T13:00:00Z")
  ]);
  assert.deepEqual(counts, { active: 1, queued: 1, failed: 1, completed: 1 });
});

test("My Deliveries has explicit loading, empty, error and ready states", () => {
  assert.equal(myDeliveriesViewState(true, false, 0), "loading");
  assert.equal(myDeliveriesViewState(false, true, 0), "empty");
  assert.equal(myDeliveriesViewState(false, false, 0), "error");
  assert.equal(myDeliveriesViewState(false, true, 1), "ready");
});

test("a dashboard containing only queued tasks remains ready", () => {
  const queuedOnly = [task("pending", "QUEUED", "2026-09-04T10:00:00Z")];
  const groups = classifyMyDeliveries(queuedOnly);
  assert.equal(myDeliveriesViewState(false, true, queuedOnly.length), "ready");
  assert.equal(groups.active, undefined);
  assert.deepEqual(groups.pending.map((item) => item.id), ["pending"]);
  assert.deepEqual(groups.recent, []);
});

test("direct USER access to admin-only routes is denied", () => {
  assert.equal(routeAllowedForRole("/stations/edit", "USER"), false);
  assert.equal(routeAllowedForRole("/tasks", "USER"), true);
  assert.equal(routeAllowedForRole("/audit", "USER"), false);
});
