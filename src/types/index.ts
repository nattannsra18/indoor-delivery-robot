export type RobotState =
  | "IDLE"
  | "GOING_TO_PICKUP"
  | "WAITING_FOR_LOADING"
  | "DELIVERING"
  | "WAITING_FOR_UNLOADING"
  | "ERROR"
  | "OFFLINE";

export type TaskStatus =
  | "QUEUED"
  | "GOING_TO_PICKUP"
  | "WAITING_FOR_LOADING"
  | "DELIVERING"
  | "WAITING_FOR_UNLOADING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface Station {
  id: string;
  name: string;
  x: number;
  y: number;
  yaw: number;
  description?: string;
}

export interface Robot {
  id: string;
  name: string;
  online: boolean;
  battery: number;
  state: RobotState;
  x: number;
  y: number;
  yaw: number;
  currentTaskId?: string;
  lastSeen: string;
}

export interface NavigationFeedbackPose {
  frameId: string;
  x: number;
  y: number;
  yaw: number;
}

export interface NavigationFeedback {
  robotId: string;
  commandId: string;
  taskId: string;
  stage: "pickup" | "destination";
  distanceRemaining: number;
  navigationTimeSeconds: number;
  estimatedTimeRemainingSeconds?: number;
  numberOfRecoveries: number;
  currentPose: NavigationFeedbackPose;
  timestamp?: string;
  serverTime: string;

  // These will be populated from ROS odometry
  // during the velocity sub-step.
  linearVelocity?: number;
  angularVelocity?: number;
}

export interface NavigationPathPose {
  x: number;
  y: number;
  yaw?: number;
}

export interface NavigationPath {
  robotId: string;
  commandId: string;
  taskId: string;
  stage: "pickup" | "destination";
  frameId: string;
  timestamp: string;
  serverTime: string;
  receivedAt: number;
  poses: NavigationPathPose[];
}

export type NavigationPathStatus =
  | "live"
  | "waiting"
  | "unavailable"
  | "stale";

export type DiagnosticLevel =
  | "OK"
  | "WARN"
  | "ERROR"
  | "STALE";

export interface DiagnosticKeyValue {
  key: string;
  value: string;
}

export interface DiagnosticStatus {
  name: string;
  level: DiagnosticLevel;
  message: string;
  hardwareId: string;
  values: DiagnosticKeyValue[];
}

export interface RobotDiagnostics {
  robotId: string;
  overallLevel: DiagnosticLevel;
  statuses: DiagnosticStatus[];
  timestamp?: string;
  serverTime: string;
}

export interface DeliveryTask {
  id: string;
  robotId?: string;
  pickupStationId: string;
  destinationStationId: string;
  status: TaskStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  progress: number;
}

export interface TaskHistoryEntry {
  id: number;
  taskId: string;
  eventType: string;
  fromStatus?: TaskStatus;
  toStatus: TaskStatus;
  source: string;
  detail?: string;
  createdAt: string;
}

export interface OccupancyGridMap {
  frameId: string;
  resolution: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
  originYaw: number;
  data: number[];
  timestamp?: string;
  revision: number;
  receivedAt: string;
}
