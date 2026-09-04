import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const i18n = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");
const locale = readFileSync(new URL("../src/context/LocaleContext.tsx", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../src/components/Sidebar.tsx", import.meta.url), "utf8");
const login = readFileSync(new URL("../src/app/login/page.tsx", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../src/components/WorkflowControls.tsx", import.meta.url), "utf8");
const globals = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const modal = readFileSync(new URL("../src/components/TaskHistoryModal.tsx", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../src/components/TaskTimeline.tsx", import.meta.url), "utf8");
const audit = readFileSync(new URL("../src/app/audit/page.tsx", import.meta.url), "utf8");
const notifications = readFileSync(new URL("../src/app/notifications/page.tsx", import.meta.url), "utf8");
test("locale foundation allowlists English and Thai with matching status catalogs", () => {
  assert.match(i18n, /locales = \["en", "th"\]/);
  for (const status of ["QUEUED", "GOING_TO_PICKUP", "WAITING_FOR_LOADING", "DELIVERING", "WAITING_FOR_UNLOADING", "COMPLETED", "FAILED", "CANCELLED"]) assert.match(i18n, new RegExp(status));
  assert.match(i18n, /Intl\.DateTimeFormat/);
});
test("locale persistence validates values and updates document language", () => {
  assert.match(locale, /isLocale\(saved\)/); assert.match(locale, /localStorage/); assert.match(locale, /document\.documentElement\.lang/); assert.doesNotMatch(locale, /dangerouslySetInnerHTML/);
});
test("mobile navigation has keyboard close and accessible state", () => {
  assert.match(sidebar, /event\.key === "Escape"/); assert.match(sidebar, /aria-expanded/); assert.match(sidebar, /setOpen\(false\)/); assert.match(sidebar, /navigationLabel/);
});
test("login uses localized labels and an accessible language switcher", () => {
  assert.match(login, /LanguageSwitcher/); assert.match(login, /t\("signIn"\)/); assert.match(login, /t\("invalidCredentials"\)/);
});
test("workflow controls translate operator actions without translating status values", () => {
  for (const key of ["confirmLoaded", "confirmReceived", "robotOfflineWaiting", "recoverRobot"]) assert.match(workflow, new RegExp(`t\\("${key}"\\)`));
  assert.match(workflow, /status === "WAITING_FOR_LOADING"/);
  assert.doesNotMatch(workflow, /Confirm Package Loaded/);
});
test("responsive foundations contain overflow and keep dialogs scrollable", () => {
  assert.match(globals, /overflow-x:clip/);
  assert.match(globals, /\[role="dialog"\]/);
  assert.match(modal, /overflow-y-auto/);
  assert.match(modal, /min-h-\[100dvh\]/);
});
test("task timeline presents stored statuses through the locale catalog", () => {
  assert.match(timeline, /t\("taskStatus"\)\[lastEntry\.toStatus\]/);
  assert.match(timeline, /t\("taskStatus"\)\[entry\.toStatus\]/);
});
test("role-aware task navigation preserves All Tasks for administrators", () => {
  assert.match(i18n, /fallback === "All Tasks" \? "งานทั้งหมด" : "งานของฉัน"/);
  assert.match(sidebar, /navigationLabel\(item\.href, item\.label, locale\)/);
});
test("audit and notification presentation catalogs cover persisted operational actions", () => {
  for (const action of ["task.arrived_pickup", "task.arrived_destination", "task.navigation_failed", "task.confirm_loaded", "task.confirm_received", "emergency.command_failed", "robot.offline", "station.deleted"]) assert.match(i18n, new RegExp(`"${action}"`));
  for (const event of ["alert.created", "alert.reopened", "alert.resolved", "emergency.activate_succeeded", "robot.disconnected"]) assert.match(i18n, new RegExp(`"${event}"`));
  assert.match(audit, /supportedAuditActions/);
  assert.match(notifications, /notificationCopy/);
});
test("localized catalog keeps IDs and stored statuses at the presentation boundary", () => {
  assert.match(i18n, /return labels\[state\].*\?\? state/);
  assert.match(notifications, /item\.entityId/);
  assert.doesNotMatch(i18n, /translate.*taskId/i);
});
