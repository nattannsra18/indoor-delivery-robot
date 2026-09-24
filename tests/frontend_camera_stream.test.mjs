import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("dashboard renders the camera beside the live map", () => {
  const dashboard = read("src/app/page.tsx");
  const camera = read("src/components/LiveCamera.tsx");
  assert.match(dashboard, /<LiveCamera[^>]*enabled=\{robotConnected\} robotId=\{robot\.id\}/);
  assert.match(camera, /aspect-\[4\/3\]/);
  assert.match(camera, /\/api\/camera\/stream/);
  assert.match(camera, /cameraResolution/);
});

test("camera proxy validates the web session and streams without caching", () => {
  const route = read("src/app/api/camera/stream/route.ts");
  assert.match(route, /\/api\/auth\/me/);
  assert.match(route, /CAMERA_STREAM_URL/);
  assert.match(route, /CAMERA_ROBOT_ID/);
  assert.match(route, /replace\(\/\\\/stream/);
  assert.match(route, /new Response\(frame/);
  assert.match(route, /"Content-Type": "image\/jpeg"/);
  assert.match(route, /X-Accel-Buffering/);
  assert.doesNotMatch(route, /rclpy|roslib|base64/i);
});

test("camera double-buffers frames and requests the next one only after load", () => {
  const camera = read("src/components/LiveCamera.tsx");
  assert.match(camera, /const \[sources, setSources\]/);
  assert.match(camera, /const nextSlot = 1 - loadedSlot/);
  assert.match(camera, /onLoad=\{\(\) => requestNextFrame\(slot\)\}/);
  assert.match(camera, /absolute inset-0/);
  assert.doesNotMatch(camera, /setInterval/);
  assert.doesNotMatch(camera, /key=\{attempt\}/);
});
