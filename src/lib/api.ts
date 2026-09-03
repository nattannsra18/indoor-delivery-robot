import type {
  Alert,
  DeliveryTask,
  EmergencyStop,
  OccupancyGridMap,
  Robot,
  Station,
  TaskHistoryEntry,
  TaskStatus,
  UserIdentity
} from "@/types";

export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

let unauthorizedHandler: (() => void) | undefined;

export function setUnauthorizedHandler(handler: (() => void) | undefined) {
  unauthorizedHandler = handler;
}

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export const WS_BASE_URL =
  process.env.NEXT_PUBLIC_WS_BASE_URL ??
  API_BASE_URL.replace(/^http/, "ws");

type ApiRobot = {
  id: string;
  name: string;
  online: boolean;
  battery: number;
  state: Robot["state"];
  x: number;
  y: number;
  yaw: number;
  current_task_id: string | null;
  last_seen: string;
};

type ApiDeliveryTask = {
  id: string;
  robot_id: string | null;
  pickup_station_id: string;
  destination_station_id: string;
  status: TaskStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  progress: number;
  owner_id: string | null;
};

type ApiTaskHistoryEntry = {
  id: number;
  task_id: string;
  event_type: string;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  source: string;
  detail: string | null;
  created_at: string;
};

type ApiOverview = {
  robot: ApiRobot;
  active_task: ApiDeliveryTask | null;
  queued_count: number;
  completed_count: number;
  failed_count: number;
};

type ApiOccupancyGridMap = {
  frame_id: string;
  resolution: number;
  width: number;
  height: number;
  origin_x: number;
  origin_y: number;
  origin_yaw: number;
  data: number[];
  timestamp: string | null;
  revision: number;
  received_at: string;
};

export type TaskEvent =
  | "CONFIRM_LOADED"
  | "CONFIRM_RECEIVED";

function toRobot(robot: ApiRobot): Robot {
  return {
    id: robot.id,
    name: robot.name,
    online: robot.online,
    battery: robot.battery,
    state: robot.state,
    x: robot.x,
    y: robot.y,
    yaw: robot.yaw,
    currentTaskId: robot.current_task_id ?? undefined,
    lastSeen: robot.last_seen
  };
}

function toTask(task: ApiDeliveryTask): DeliveryTask {
  return {
    id: task.id,
    robotId: task.robot_id ?? undefined,
    pickupStationId: task.pickup_station_id,
    destinationStationId: task.destination_station_id,
    status: task.status,
    createdAt: task.created_at,
    startedAt: task.started_at ?? undefined,
    completedAt: task.completed_at ?? undefined,
    progress: task.progress,
    ownerId: task.owner_id ?? undefined
  };
}

function toHistory(entry: ApiTaskHistoryEntry): TaskHistoryEntry {
  return {
    id: entry.id,
    taskId: entry.task_id,
    eventType: entry.event_type,
    fromStatus: entry.from_status ?? undefined,
    toStatus: entry.to_status,
    source: entry.source,
    detail: entry.detail ?? undefined,
    createdAt: entry.created_at
  };
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
    credentials: "include"
  });

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { detail?: string | Array<{ msg?: string }> };
      if (typeof body.detail === "string") {
        detail = body.detail;
      } else if (Array.isArray(body.detail)) {
        detail = body.detail.map((item) => item.msg).filter(Boolean).join(", ") || detail;
      }
    } catch {
      // Keep HTTP status if the response is not JSON.
    }
    const error = new ApiError(response.status, detail);
    if (response.status === 401) unauthorizedHandler?.();
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function login(username: string, password: string): Promise<UserIdentity> {
  return request<UserIdentity>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ username, password })
  });
}

export function logout(): Promise<void> {
  return request<void>("/api/auth/logout", { method: "POST" });
}

export function getCurrentUser(): Promise<UserIdentity> {
  return request<UserIdentity>("/api/auth/me");
}

export function getActiveAlerts(): Promise<Alert[]> {
  return request<Alert[]>("/api/alerts/active");
}

export function acknowledgeAlert(alertId: string): Promise<Alert> {
  return request<Alert>(`/api/alerts/${alertId}/acknowledge`, { method: "POST" });
}

export function resolveAlert(alertId: string): Promise<Alert> {
  return request<Alert>(`/api/alerts/${alertId}/resolve`, { method: "POST" });
}

export function getEmergencyStop(robotId: string): Promise<EmergencyStop> {
  return request<EmergencyStop>(`/api/robots/${robotId}/emergency-stop`);
}

export function activateEmergencyStop(robotId: string): Promise<EmergencyStop> {
  return request<EmergencyStop>(`/api/robots/${robotId}/emergency-stop`, { method: "POST" });
}

export function resetEmergencyStop(robotId: string): Promise<EmergencyStop> {
  return request<EmergencyStop>(`/api/robots/${robotId}/emergency-stop/reset`, { method: "POST" });
}

export async function getOverview() {
  const data = await request<ApiOverview>("/api/overview");
  return {
    robot: toRobot(data.robot),
    activeTask: data.active_task ? toTask(data.active_task) : undefined,
    queuedCount: data.queued_count,
    completedCount: data.completed_count,
    failedCount: data.failed_count
  };
}

export async function getStations(): Promise<Station[]> {
  return request<Station[]>("/api/stations");
}

export async function getMap(): Promise<OccupancyGridMap> {
  const map = await request<ApiOccupancyGridMap>("/api/map");

  return {
    frameId: map.frame_id,
    resolution: map.resolution,
    width: map.width,
    height: map.height,
    originX: map.origin_x,
    originY: map.origin_y,
    originYaw: map.origin_yaw,
    data: map.data,
    timestamp: map.timestamp ?? undefined,
    revision: map.revision,
    receivedAt: map.received_at
  };
}
export async function getTasks(): Promise<DeliveryTask[]> {
  const tasks = await request<ApiDeliveryTask[]>("/api/tasks");
  return tasks.map(toTask);
}

export async function getTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  const history = await request<ApiTaskHistoryEntry[]>(`/api/tasks/${taskId}/history`);
  return history.map(toHistory);
}

export async function createTask(
  pickupStationId: string,
  destinationStationId: string
): Promise<DeliveryTask> {
  const task = await request<ApiDeliveryTask>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      pickup_station_id: pickupStationId,
      destination_station_id: destinationStationId
    })
  });
  return toTask(task);
}

export async function applyTaskEvent(
  taskId: string,
  event: TaskEvent,
  detail?: string
): Promise<DeliveryTask> {
  const task = await request<ApiDeliveryTask>(
    `/api/tasks/${taskId}/events`,
    {
      method: "POST",
      body: JSON.stringify({
        event,
        detail: detail ?? null
      })
    }
  );

  return toTask(task);
}

export async function cancelTask(taskId: string): Promise<DeliveryTask> {
  const task = await request<ApiDeliveryTask>(`/api/tasks/${taskId}/cancel`, {
    method: "POST"
  });
  return toTask(task);
}

export async function retryTask(taskId: string): Promise<DeliveryTask> {
  const task = await request<ApiDeliveryTask>(`/api/tasks/${taskId}/retry`, {
    method: "POST"
  });
  return toTask(task);
}

export async function recoverRobot(robotId: string): Promise<Robot> {
  return toRobot(await request<ApiRobot>(`/api/robots/${robotId}/recover`, { method: "POST" }));
}

export async function addStation(station: Omit<Station, "id">): Promise<Station> {
  return request<Station>("/api/stations", {
    method: "POST",
    body: JSON.stringify(station)
  });
}

export async function deleteStation(stationId: string): Promise<void> {
  await request<void>(`/api/stations/${stationId}`, { method: "DELETE" });
}
