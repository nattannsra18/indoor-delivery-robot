import { NavigationPath } from "@/types";

export const MAX_NAVIGATION_PATH_POSES = 500;

export type NavigationPathClear = {
  robotId: string;
  commandId: string;
  taskId: string;
  stage: "pickup" | "destination";
  reason: string;
};

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isStage(
  value: unknown
): value is "pickup" | "destination" {
  return value === "pickup" || value === "destination";
}

function validString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function validTimestamp(value: unknown): value is string {
  return (
    validString(value)
    && Number.isFinite(Date.parse(value))
  );
}

export function normalizeFrameId(frameId: string): string {
  return frameId.replace(/^\/+/, "");
}

export function framesAreCompatible(
  first: string,
  second: string
): boolean {
  return normalizeFrameId(first) === normalizeFrameId(second);
}

export function parseNavigationPath(
  value: unknown,
  receivedAt = Date.now()
): NavigationPath | undefined {
  if (
    !isRecord(value)
    || value.type !== "navigation_path"
    || !validString(value.robot_id)
    || !validString(value.command_id)
    || !validString(value.task_id)
    || !isStage(value.stage)
    || !validString(value.frame_id)
    || !validTimestamp(value.timestamp)
    || !validTimestamp(value.server_time)
    || !Array.isArray(value.poses)
    || value.poses.length < 1
    || value.poses.length > MAX_NAVIGATION_PATH_POSES
    || !Number.isFinite(receivedAt)
  ) {
    return undefined;
  }

  const poses = [];
  for (const pose of value.poses) {
    if (
      !isRecord(pose)
      || typeof pose.x !== "number"
      || !Number.isFinite(pose.x)
      || typeof pose.y !== "number"
      || !Number.isFinite(pose.y)
      || !(
        pose.yaw === null
        || pose.yaw === undefined
        || (
          typeof pose.yaw === "number"
          && Number.isFinite(pose.yaw)
        )
      )
    ) {
      return undefined;
    }

    poses.push({
      x: pose.x,
      y: pose.y,
      ...(typeof pose.yaw === "number"
        ? { yaw: pose.yaw }
        : {})
    });
  }

  return {
    robotId: value.robot_id,
    commandId: value.command_id,
    taskId: value.task_id,
    stage: value.stage,
    frameId: value.frame_id,
    timestamp: value.timestamp,
    serverTime: value.server_time,
    receivedAt,
    poses
  };
}

export function parseNavigationPathClear(
  value: unknown
): NavigationPathClear | undefined {
  if (
    !isRecord(value)
    || value.type !== "navigation_path_clear"
    || !validString(value.robot_id)
    || !validString(value.command_id)
    || !validString(value.task_id)
    || !isStage(value.stage)
    || !validString(value.reason)
    || !validTimestamp(value.server_time)
  ) {
    return undefined;
  }

  return {
    robotId: value.robot_id,
    commandId: value.command_id,
    taskId: value.task_id,
    stage: value.stage,
    reason: value.reason
  };
}
