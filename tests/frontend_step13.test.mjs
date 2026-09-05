import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatPreviewDuration,
  routePreviewIsFresh
} from "../src/lib/routePreview.ts";


test("preview validity rejects expired and invalid timestamps", () => {
  assert.equal(routePreviewIsFresh("2026-01-01T00:01:00Z", Date.parse("2026-01-01T00:00:00Z")), true);
  assert.equal(routePreviewIsFresh("2026-01-01T00:00:00Z", Date.parse("2026-01-01T00:00:00Z")), false);
  assert.equal(routePreviewIsFresh("invalid", 0), false);
});


test("preview duration never renders invalid ETA as zero", () => {
  assert.equal(formatPreviewDuration(20.2), "21 sec");
  assert.equal(formatPreviewDuration(61), "about 2 min");
  assert.equal(formatPreviewDuration(Number.NaN), "Unavailable");
  assert.equal(formatPreviewDuration(-1), "Unavailable");
});


test("creation sends the one-use preview id back to FastAPI", () => {
  const apiSource = readFileSync(
    new URL("../src/lib/api.ts", import.meta.url),
    "utf8"
  );
  assert.match(apiSource, /\/api\/tasks\/preview/);
  assert.match(apiSource, /preview_id:\s*input\.previewId/);
});


test("map-first delivery flow validates with Nav2 before task creation", () => {
  const pageSource = readFileSync(
    new URL("../src/app/delivery/page.tsx", import.meta.url),
    "utf8"
  );
  assert.match(pageSource, /await previewTaskRoute/);
  assert.match(pageSource, /previewId:\s*preview\.previewId/);
  assert.match(pageSource, /routePreviewIsFresh/);
  assert.match(pageSource, /flow\.routeAvailable/);
  assert.match(pageSource, /role="dialog"/);
  assert.match(pageSource, /requestCreated/);
});


test("map renders separate pickup and destination preview paths", () => {
  const mapSource = readFileSync(
    new URL("../src/components/RobotMap.tsx", import.meta.url),
    "utf8"
  );
  assert.match(mapSource, /routePreview\.pickupPath/);
  assert.match(mapSource, /routePreview\.deliveryPath/);
  assert.match(mapSource, /copy\.mapPreviewPickup/);
  assert.match(mapSource, /copy\.mapPreviewDestination/);
});
