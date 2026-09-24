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
  const deliveryMap = read("src/components/DashboardDeliveryMap.tsx");
  const robotMap = read("src/components/RobotMap.tsx");
  assert.match(source, /operationsOverview/);
  assert.match(source, /<DashboardDeliveryMap/);
  assert.match(deliveryMap, /<RobotMap/);
  assert.match(source, /<EmergencyStopControl/);
  assert.match(source, /<WorkflowControls/);
  assert.match(source, /lg:grid-cols-2/);
  assert.match(deliveryMap, /lg:col-span-2 xl:col-span-1/);
  assert.match(robotMap, /window\.innerHeight \* 0\.58/);
  assert.match(robotMap, /min-h-\[clamp\(28rem,58dvh,47\.5rem\)\]/);
  assert.match(robotMap, /window\.addEventListener\("resize", updateCanvasSize\)/);
});

test("admin dashboard consolidates robot profile and navigation without duplicating diagnostics", () => {
  const source = read("src/app/page.tsx");
  assert.match(source, /<NavigationMetrics/);
  assert.match(source, /batterySource === "SIMULATED"/);
  assert.match(source, /displayedTaskProgress/);
  assert.doesNotMatch(source, /href="\/robots"/);
  assert.doesNotMatch(source, /<DiagnosticsCards/);
  assert.doesNotMatch(source, /System Connections/);
  assert.match(source, /<NavigationMetrics compact layout="rail"/);
  assert.match(source, /taskId=\{activeTask\?\.id\} status=\{activeTask\?\.status\}/);
  assert.ok(
    source.indexOf("<DashboardDeliveryMap") < source.indexOf("<MissionPanel")
      && source.indexOf("<MissionPanel") < source.indexOf("function SelectedRobotPanel"),
    "Live navigation should remain in the dashboard control rail instead of moving below the map"
  );
  assert.ok(
    source.lastIndexOf("<RecentActivity") > source.indexOf("<FleetOverview"),
    "Recent delivery activity should remain the final dashboard card"
  );
  assert.ok(
    source.indexOf("<CompactDiagnostics") < source.indexOf("<ActiveIssues")
      && source.indexOf("<ActiveIssues") < source.indexOf("<RobotOperationsControl compact"),
    "Sensor health, active issues and navigation recovery should remain in that order"
  );
  assert.doesNotMatch(source, /ROBOT_HEARTBEAT_FRESH_MS/);
  assert.match(source, /label="Robot Agent" state=\{robotConnected \? "active" : "inactive"\}/);
});

test("diagnostics page owns system connections and detailed ROS diagnostics", () => {
  const source = read("src/app/diagnostics/page.tsx");
  assert.match(source, /<DiagnosticsCards diagnostics=\{diagnostics\}/);
  assert.match(source, /name="ROS 2 Web Bridge"/);
  assert.match(source, /name="PostgreSQL"/);
  assert.match(source, /name="Nav2"/);
  assert.match(source, /copy\.integrationHealth/);
});

test("admin robot controls separate bounded recovery from destructive actions", () => {
  const dashboard = read("src/app/page.tsx");
  const deliveryMap = read("src/components/DashboardDeliveryMap.tsx");
  const controls = read("src/components/RobotOperationsControl.tsx");
  assert.match(dashboard, /<RobotOperationsControl/);
  assert.match(dashboard, /<RobotOperationsControl mode="admin"/);
  assert.match(dashboard, /<RobotSelectorCard/);
  assert.match(deliveryMap, /viewportSize="dashboard"/);
  assert.match(controls, /"navigation\.recover"/);
  assert.match(controls, /"motor\.reset_stall"/);
  assert.match(controls, /flex flex-wrap gap-2/);
  assert.match(controls, /shrink-0 whitespace-nowrap/);
  assert.match(controls, /"navigation\.restart_if_broken"/);
  assert.match(controls, /"system\.start_navigation"/);
  assert.match(controls, /confirmAndRun\("system\.stop_navigation"/);
  assert.match(controls, /confirmAndRun\("system\.shutdown"/);
});

test("dashboard map opens a route-validated delivery workflow from station markers", () => {
  const source = read("src/components/DashboardDeliveryMap.tsx");
  assert.match(source, /onStationSelect=\{openFromStation\}/);
  assert.match(source, /previewTaskRoute\(\{/);
  assert.match(source, /routePreviewIsFresh/);
  assert.match(source, /supervisedMode/);
  assert.match(source, /createTask\(\{/);
  assert.match(source, /robotId: selectedDeliveryRobotId/);
  assert.match(source, /selectedRobotLockedHelp/);
  assert.doesNotMatch(source, /dashboard-robot-assignment/);
  assert.doesNotMatch(source, /rankFleet/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /event\.key === "Escape"/);
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
  const sidebar = read("src/components/Sidebar.tsx");
  assert.match(source, /item\.category === "CRITICAL"/);
  assert.match(source, /unreadByCategory\.CRITICAL/);
  assert.match(source, /\/tasks\?task=/);
  assert.match(source, /getCachedNotificationPage/);
  assert.match(source, /sameNotificationPage/);
  assert.match(source, /requestSequence/);
  assert.match(sidebar, /setCachedNotificationPage/);
  assert.doesNotMatch(source, /eventType\.includes\("failed"\)/);
});

test("admin dashboard localizes robot states instead of formatting raw enums", () => {
  const source = read("src/app/page.tsx");
  assert.match(source, /robotStateLabel/);
  assert.doesNotMatch(source, /robot\.state\.replaceAll/);
});
