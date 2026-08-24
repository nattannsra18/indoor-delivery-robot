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
