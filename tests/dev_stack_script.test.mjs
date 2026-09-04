import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptUrl = new URL("../scripts/run_dev_stack.sh", import.meta.url);
const scriptPath = scriptUrl.pathname;
const source = readFileSync(scriptUrl, "utf8");

test("development stack launcher is executable and valid Bash", () => {
  assert.notEqual(statSync(scriptUrl).mode & 0o111, 0);
  const syntax = spawnSync("bash", ["-n", scriptPath], { encoding: "utf8" });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("launcher documents lifecycle commands", () => {
  const result = spawnSync(scriptPath, ["help"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  for (const command of ["start", "stop", "restart", "status", "attach", "logs"]) {
    assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  }
});

test("FastAPI and ROS Bridge inherit the same tmux token", () => {
  assert.match(source, /set-environment[^\n]+ROBOT_WS_TOKEN/);
  assert.match(source, /run_fastapi\(\)/);
  assert.match(source, /run_bridge\(\)/);
  assert.match(source, /ROBOT_WS_AUTH_REQUIRED=true/);
});

test("stop is scoped to the owned tmux session", () => {
  assert.match(source, /send-keys[^\n]+C-c/);
  assert.match(source, /kill-session -t/);
  assert.doesNotMatch(source, /\bpkill\b/);
  assert.doesNotMatch(source, /killall/);
});

test("service logs use stable tmux window metadata", () => {
  assert.match(source, /automatic-rename off/);
  assert.match(source, /@amr_service/);
  assert.match(source, /find_service_window/);
  assert.match(source, /capture-pane[^\n]+window_target/);
});
