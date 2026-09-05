import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("shared sidebar uses the supplied robot mark for both roles", () => {
  const source = read("src/components/Sidebar.tsx");
  assert.match(source, /delivery-robot-mark\.png/);
  assert.doesNotMatch(source, />R<\/div>/);
  assert.match(source, /user\?\.role === "ADMIN"/);
});

test("admin dashboard prioritizes operations, map, safety and live mission data", () => {
  const source = read("src/app/page.tsx");
  assert.match(source, /operationsOverview/);
  assert.match(source, /<RobotMap/);
  assert.match(source, /<EmergencyStopControl/);
  assert.match(source, /<WorkflowControls/);
});

test("admin dashboard consolidates robot profile, navigation, diagnostics and integrations", () => {
  const source = read("src/app/page.tsx");
  assert.match(source, /<DiagnosticsCards/);
  assert.match(source, /<NavigationMetrics/);
  assert.match(source, /Integration name="ROS 2 Web Bridge"/);
  assert.match(source, /batterySource === "SIMULATED"/);
  assert.match(source, /apiDatabaseReachable/);
  assert.match(source, /displayedTaskProgress/);
  assert.doesNotMatch(source, /href="\/robots"/);
  assert.ok(
    source.indexOf("<WorkflowControls") < source.indexOf("{ui.currentMission}"),
    "Mission Control should be rendered above Current Mission"
  );
});

test("alert center is an accessible operational dialog with Escape support", () => {
  const source = read("src/components/AlertCenter.tsx");
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /event\.key !== "Tab"/);
});

test("task drawer traps focus, locks scrolling and supports notification deep links", () => {
  const source = read("src/app/tasks/page.tsx");
  assert.match(source, /document\.body\.style\.overflow = "hidden"/);
  assert.match(source, /event\.key !== "Tab"/);
  assert.match(source, /returnFocusRef/);
  assert.match(source, /URLSearchParams\(window\.location\.search\)/);
  assert.match(source, /getTaskPage/);
  assert.match(source, /task-drawer-feedback/);
});

test("notification filters consume backend semantics and deep-link to a task", () => {
  const source = read("src/app/notifications/page.tsx");
  assert.match(source, /item\.category === "CRITICAL"/);
  assert.match(source, /unreadByCategory\.CRITICAL/);
  assert.match(source, /\/tasks\?task=/);
  assert.doesNotMatch(source, /eventType\.includes\("failed"\)/);
});

test("admin dashboard localizes robot states instead of formatting raw enums", () => {
  const source = read("src/app/page.tsx");
  assert.match(source, /robotStateLabel/);
  assert.doesNotMatch(source, /robot\.state\.replaceAll/);
});
