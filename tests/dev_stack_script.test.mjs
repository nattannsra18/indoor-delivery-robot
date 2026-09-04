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

test("preflight rejects external Gazebo servers without broad self-matching", () => {
  assert.match(source, /pgrep -af '\[g\]z sim -r -s '/);
  assert.match(source, /A Gazebo server is already running/);
  assert.doesNotMatch(source, /pgrep -af 'gz sim -r -s /);
  assert.doesNotMatch(source, /\bpkill\b/);
  assert.doesNotMatch(source, /killall/);
});

test("service logs use stable tmux window metadata", () => {
  assert.match(source, /automatic-rename off/);
  assert.match(source, /@amr_service/);
  assert.match(source, /find_service_window/);
  assert.match(source, /capture-pane[^\n]+window_target/);
});

test("Gazebo starts server-first and waits before opening its GUI", () => {
  const gazebo = source.match(/run_gazebo\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  const gazeboGui = source.match(/run_gazebo_gui\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(gazebo, /navigation\.launch\.py headless:=True/);
  assert.match(gazeboGui, /deadline=\$\(\(SECONDS \+ 120\)\)/);
  assert.match(gazeboGui, /while \(\(SECONDS < deadline\)\)/);
  assert.match(gazeboGui, /timeout 5 gz topic -l/);
  assert.match(gazeboGui, /grep -Fxq "\/world\/warehouse\/scene\/info"/);
  assert.match(gazeboGui, /timeout 10 ros2 topic echo --once \/odom/);
  assert.match(gazeboGui, /Waiting for Gazebo world and robot state\.\.\./);
  assert.match(gazeboGui, /Gazebo world and robot state are ready; starting GUI\./);
  assert.match(gazeboGui, /exec gz sim -g -v 4/);
  assert.doesNotMatch(
    gazeboGui,
    /ros2 topic echo --once \/world\/warehouse\/scene\/info/,
  );
});

test("Gazebo GUI is an owned service with logs and duplicate-process safeguards", () => {
  assert.match(source, /configure_window[^\n]+gazebo_gui/);
  assert.match(source, /__gazebo_gui\) run_gazebo_gui/);
  assert.match(source, /for service in fastapi frontend gazebo gazebo_gui bridge/);
  assert.match(source, /\[g\]z sim -g/);
  assert.match(source, /require_command gz/);
  assert.doesNotMatch(source, /\bpkill\b/);
  assert.doesNotMatch(source, /killall/);
});

test("ROS setup files are sourced without nounset failures", () => {
  const sourceRos = source.match(/source_ros\(\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(sourceRos, /set \+u[\s\S]*setup\.bash[\s\S]*set -u/);
});
