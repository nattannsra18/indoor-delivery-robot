import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("delivery speed is validated by the control plane and enforced by the Agent contract", async () => {
  const [page, modal, api, backend, speeds] = await Promise.all([
    read("src/app/delivery/page.tsx"),
    read("src/components/DashboardDeliveryMap.tsx"),
    read("src/lib/api.ts"),
    read("backend/app/models.py"),
    read("src/lib/navigationSpeed.ts"),
  ]);
  assert.match(page, /NAVIGATION_SPEED_OPTIONS/);
  assert.match(modal, /NAVIGATION_SPEED_OPTIONS/);
  assert.match(api, /max_linear_speed: input\.maxLinearSpeed/);
  assert.match(backend, /max_linear_speed: float = Field\(default=0\.10, ge=0\.08, le=0\.30\)/);
  assert.match(speeds, /DEFAULT_NAVIGATION_SPEED = 0\.15/);
  assert.match(speeds, /value: 0\.15, key: "normal"/);
});

test("readiness changes refresh the live fleet without waiting for fallback polling", async () => {
  const [context, websocket] = await Promise.all([
    read("src/context/ApiDeliveryContext.tsx"),
    read("backend/app/routers/robot_ws.py"),
  ]);
  assert.match(context, /message\.type === "robot_readiness_changed"/);
  assert.match(websocket, /"type": "robot_readiness_changed"/);
});
