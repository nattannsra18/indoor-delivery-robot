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

test("web mapping keeps the selected robot camera beside remote controls", () => {
  const maps = read("src/app/maps/page.tsx");
  assert.match(maps, /<LiveCamera[^>]*enabled=\{robot\.online\}[^>]*robotId=\{robotId \|\| robot\.id\}/);
  assert.match(maps, /2xl:grid-cols-\[minmax\(0,1\.35fr\)_minmax\(320px,0\.58fr\)_minmax\(340px,0\.62fr\)\]/);
  assert.doesNotMatch(maps, /<RobotOperationsControl mode="mapping"/);
});

test("camera proxy validates the web session and streams without caching", () => {
  const route = read("src/app/api/camera/stream/route.ts");
  assert.match(route, /\/api\/auth\/me/);
  assert.match(route, /CAMERA_STREAM_URL/);
  assert.match(route, /CAMERA_ROBOT_ID/);
  assert.match(route, /fetch\(streamUrl/);
  assert.match(route, /new Response\(stream\.body/);
  assert.match(route, /multipart\/x-mixed-replace/);
  assert.match(route, /X-Accel-Buffering/);
  assert.doesNotMatch(route, /rclpy|roslib|base64/i);
});

test("camera renders one continuous MJPEG stream without snapshot polling", () => {
  const camera = read("src/components/LiveCamera.tsx");
  assert.match(camera, /const streamUrl = `\/api\/camera\/stream/);
  assert.match(camera, /onLoad=\{\(\) => \{ setLoaded\(true\)/);
  assert.match(camera, /absolute inset-0/);
  assert.doesNotMatch(camera, /setInterval/);
  assert.doesNotMatch(camera, /FRAME_DELAY_MS|RETRY_DELAY_MS|setTimeout/);
});
