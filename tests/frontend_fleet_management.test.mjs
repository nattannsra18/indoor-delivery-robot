import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("delivery creation supports automatic and explicit fleet assignment", () => {
  const page = read("src/app/delivery/page.tsx");
  const api = read("src/lib/api.ts");
  const types = read("src/types/index.ts");

  assert.match(page, /getFleet\(\)/);
  assert.match(page, /flow\.automaticAssignment/);
  assert.match(page, /item\.activeMapId !== pickupStation\.mapId/);
  assert.match(page, /Math\.hypot\(left\.x - pickupStation\.x/);
  assert.match(page, /flow\.distanceToPickup/);
  assert.match(page, /flow\.activeMapUnknown/);
  assert.match(page, /robotId: preview\.robotId/);
  assert.match(page, /preview\.queuePosition/);
  assert.match(page, /preview\.estimatedStartSeconds/);
  assert.match(api, /"\/api\/robots\/fleet"/);
  assert.match(api, /robot_id: input\.robotId/);
  assert.match(types, /interface FleetRobot/);
  assert.match(types, /x: number;/);
});

test("admin dashboard shows a refreshable selectable fleet overview", () => {
  const dashboard = read("src/app/page.tsx");
  const fleet = read("src/components/FleetOverview.tsx");

  assert.match(dashboard, /<FleetOverview \/>/);
  assert.match(fleet, /getFleet\(\)/);
  assert.match(fleet, /REFRESH_INTERVAL_MS = 3000/);
  assert.match(fleet, /aria-pressed=\{active\}/);
  assert.match(fleet, /selected\.x\.toFixed\(2\)/);
  assert.match(fleet, /selected\.activeMapId/);
  assert.match(fleet, /selected\.currentTaskId/);
});

test("robot registry loads operational fleet data", () => {
  const page = read("src/app/robots/page.tsx");
  const api = read("src/lib/api.ts");
  const types = read("src/types/index.ts");
  assert.match(page, /getFleet\(\)/);
  assert.match(page, /setFleet/);
  assert.match(page, /ProfileValidation/);
  assert.match(page, /robot\.validationResults/);
  assert.match(api, /validation_results/);
  assert.match(types, /interface RobotProfileValidationResult/);
});
