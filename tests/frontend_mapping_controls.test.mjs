import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync(new URL("../src/app/maps/page.tsx", import.meta.url), "utf8");
const copy = readFileSync(new URL("../src/lib/i18n.ts", import.meta.url), "utf8");

test("mapping teleop separates bounded driving and turning speeds", () => {
  assert.match(page, /setDriveSpeed\] = useState\(0\.16\)/);
  assert.match(page, /setTurnSpeed\] = useState\(0\.80\)/);
  assert.match(page, /min="0\.06" max="0\.30"/);
  assert.match(page, /min="0\.30" max="1\.00"/);
  assert.doesNotMatch(page, /driveSpeed \* 4/);
  assert.match(copy, /turnSpeed: "Turning speed"/);
  assert.match(copy, /turnSpeed: "ความเร็วในการหมุน"/);
});
