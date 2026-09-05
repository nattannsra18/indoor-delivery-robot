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
    /ADMIN_ONLY_ROUTES = \["\/maps", "\/stations", "\/users", "\/audit"\]/
  );
});

test("signup and reset consume one backend password policy", () => {
  const signup = read("src/app/signup/page.tsx");
  const reset = read("src/app/reset-password/page.tsx");
  assert.match(signup, /getPasswordPolicy/);
  assert.match(reset, /getPasswordPolicy/);
  assert.match(signup, /passwordPolicyError/);
  assert.match(reset, /passwordPolicyError/);
});

test("notifications are task-centric with operational filters and grouping", () => {
  const page = read("src/app/notifications/page.tsx");
  assert.match(page, /buildGroups/);
  assert.match(page, /task:\$\{item\.entityId\}/);
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
  assert.match(page, /<DiagnosticsCards/);
  assert.ok(page.indexOf("recentActivity") < page.indexOf("diagnosticsDetails"));
});
