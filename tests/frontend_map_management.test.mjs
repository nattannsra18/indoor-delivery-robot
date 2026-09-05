import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("admin navigation exposes Map Management as an admin-only route", () => {
  const dashboardSource = read("src/lib/roleDashboard.ts");

  assert.match(dashboardSource, /href: "\/maps"/);
  assert.match(dashboardSource, /ADMIN_ONLY_ROUTES[\s\S]*"\/maps"/);
});

test("Map Management consumes the robot catalog and reuses the live RobotMap", () => {
  const pageSource = read("src/app/maps/page.tsx");
  const apiSource = read("src/lib/api.ts");

  assert.match(pageSource, /getMapCatalog/);
  assert.match(pageSource, /refreshMapCatalog/);
  assert.match(pageSource, /activateRobotMap/);
  assert.match(pageSource, /getMapOperation/);
  assert.match(pageSource, /updateRobotMapDetails/);
  assert.match(pageSource, /renameRobotMap/);
  assert.match(pageSource, /deleteRobotMap/);
  assert.match(pageSource, /<RobotMap/);
  assert.match(pageSource, /role="dialog"/);
  assert.match(pageSource, /event\.key === "Escape"/);
  assert.match(pageSource, /document\.body\.style\.overflow = "hidden"/);
  assert.match(pageSource, /mapManagementText\[locale\]/);
  assert.match(apiSource, /\/api\/map\/catalog/);
  assert.match(apiSource, /\/api\/map\/catalog\/refresh/);
  assert.match(apiSource, /\/api\/map\/catalog\/\$\{encodeURIComponent\(mapId\)\}\/activate/);
  assert.match(apiSource, /\/api\/map\/operations\/\$\{encodeURIComponent\(commandId\)\}/);
  assert.match(apiSource, /\/metadata\?robot_id=/);
  assert.match(apiSource, /\/rename\?robot_id=/);
  assert.match(apiSource, /method: "DELETE"/);
  assert.match(apiSource, /\/api\/map\/catalog-operations\//);
});
