import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
const api = readFileSync(new URL("../src/lib/api.ts", import.meta.url), "utf8");
const page = readFileSync(new URL("../src/app/notifications/page.tsx", import.meta.url), "utf8");
const audit = readFileSync(new URL("../src/app/audit/page.tsx", import.meta.url), "utf8");
test("notification UI covers localized loading, empty, retry and read controls", () => { assert.match(page,/t\("loading"\)/);assert.match(page,/t\("noNotifications"\)/);assert.match(page,/markNotificationRead/);assert.match(page,/markAllNotificationsRead/);assert.match(page,/idr:notification/); });
test("notification and audit APIs use authenticated client endpoints", () => { assert.match(api,/\/api\/notifications/);assert.match(api,/\/api\/audit/);assert.match(audit,/nextOffset/);assert.match(audit,/loadMore/);assert.doesNotMatch(page,/dangerouslySetInnerHTML/);assert.doesNotMatch(audit,/dangerouslySetInnerHTML/); });
