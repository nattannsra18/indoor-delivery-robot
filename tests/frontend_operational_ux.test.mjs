import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin account approval is available only through the protected user route", () => {
  const page = read("src/app/users/page.tsx");
  const api = read("src/lib/api.ts");
  const roles = read("src/lib/roleDashboard.ts");
  assert.match(page, /getPendingAccounts/);
  assert.match(page, /approveAccount/);
  assert.match(api, /\/api\/auth\/pending-accounts/);
  assert.match(api, /\/api\/auth\/accounts\/\$\{userId\}\/approve/);
  assert.match(
    roles,
    /ADMIN_ONLY_ROUTES = \["\/maps", "\/stations", "\/robots", "\/users", "\/audit"\]/
  );
});

test("robot registry uses secure pairing, rotation and identity anomaly states", () => {
  const page = read("src/app/robots/page.tsx");
  const api = read("src/lib/api.ts");
  const roles = read("src/lib/roleDashboard.ts");
  assert.match(page, /fingerprintSha256/);
  assert.match(page, /approveRobotEnrollment/);
  assert.match(page, /revokeRobotCredential/);
  assert.match(page, /rotateRobotCredential/);
  assert.match(page, /identityAnomalyCode/);
  assert.match(page, /readinessStatus/);
  assert.match(api, /\/api\/robot-registry\/enrollments/);
  assert.match(api, /\/api\/robot-registry\/robots/);
  assert.match(api, /\/rotate/);
  assert.match(roles, /href: "\/robots"/);
});

test("signup and reset consume one backend password policy", () => {
  const signup = read("src/app/signup/page.tsx");
  const reset = read("src/app/reset-password/page.tsx");
  assert.match(signup, /getPasswordPolicy/);
  assert.match(reset, /getPasswordPolicy/);
  assert.match(signup, /password\.length >= passwordPolicy\.minimumLength/);
  assert.match(signup, /passwordPolicy\.requireLetter/);
  assert.match(signup, /passwordPolicy\.requireNumber/);
  assert.match(signup, /<Requirement met=/);
  assert.match(reset, /passwordPolicyError/);
});

test("notifications are task-centric with operational filters and grouping", () => {
  const page = read("src/app/notifications/page.tsx");
  assert.match(page, /buildGroups/);
  assert.match(page, /`\$\{item\.entityType\}:\$\{item\.entityId\}`/);
  assert.match(page, /`\/tasks\?task=\$\{encodeURIComponent\(group\.taskId\)\}`/);
  assert.match(page, /"action", "critical", "delivery"/);
  assert.match(page, /markGroupRead/);
});

test("tasks use a compact primary table and a details drawer", () => {
  const page = read("src/app/tasks/page.tsx");
  assert.match(page, /aria-labelledby="task-details-title"/);
  assert.match(page, /copy\.route/);
  assert.match(page, /copy\.owner/);
  assert.match(page, /taskEstimateById\.get\(selectedTask\.id\)/);
  assert.doesNotMatch(page, /min-w-\[1200px\]/);
});

test("detailed dashboard telemetry is progressively disclosed", () => {
  const page = read("src/app/page.tsx");
  assert.match(page, /<details className="group mt-6/);
  assert.match(page, /<DiagnosticsCards diagnostics=\{sensorDiagnostics\}/);
  assert.match(page, /const nav2Diagnostic = diagnostics\?\.statuses\.find\(isNav2Diagnostic\)/);
  assert.match(page, /state=\{nav2Diagnostic\?\.message/);
  assert.ok(page.indexOf("recentActivity") < page.indexOf("diagnosticsDetails"));
});

test("station mutations use prominent accessible feedback", () => {
  const stationPage = read("src/app/stations/page.tsx");
  const accountPage = read("src/app/users/page.tsx");
  const toast = read("src/components/ActionToast.tsx");
  assert.match(stationPage, /<ActionToast/);
  assert.match(stationPage, /copy\.stationInUse/);
  assert.match(accountPage, /<ActionToast/);
  assert.match(toast, /role=\{success \? "status" : "alert"\}/);
  assert.match(toast, /aria-live=\{success \? "polite" : "assertive"\}/);
  assert.match(toast, /window\.setTimeout\(onClose, durationMs\)/);
});
