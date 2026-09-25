import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard renders the camera beside the live map", () => {
  const dashboard = read("src/app/page.tsx");
  const camera = read("src/components/LiveCamera.tsx");
  assert.match(dashboard, /<LiveCamera[^>]*enabled=\{robotConnected\} robotId=\{robot\.id\}/);
  assert.match(camera, /aspect-\[4\/3\]/);
  assert.match(camera, /<canvas/);
  assert.match(camera, /cameraMetrics/);
});

test("web mapping keeps the selected robot camera beside remote controls", () => {
  const maps = read("src/app/maps/page.tsx");
  assert.match(maps, /<LiveCamera[^>]*enabled=\{robot\.online\}[^>]*robotId=\{robotId \|\| robot\.id\}/);
  assert.match(maps, /2xl:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.58fr\)_minmax\(340px,0\.62fr\)\]/);
  assert.doesNotMatch(maps, /<RobotOperationsControl mode="mapping"/);
});

test("camera uses direct authenticated WSS with one decoded frame in flight", () => {
  const camera = read("src/components/LiveCamera.tsx");
  assert.match(camera, /WS_BASE_URL/);
  assert.match(camera, /\/ws\/browser\/robots\//);
  assert.match(camera, /type: "next_frame"/);
  assert.match(camera, /createImageBitmap/);
  assert.match(camera, /requestNextFrame\(\);/);
  assert.match(camera, /getBigUint64/);
  assert.doesNotMatch(camera, /<img/);
  assert.doesNotMatch(camera, /base64/i);
  assert.doesNotMatch(camera, /setInterval/);
});
