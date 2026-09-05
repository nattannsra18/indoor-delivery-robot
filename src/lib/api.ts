import type {
  Alert,
  DeliveryTask,
  EmergencyStop,
  MapMetadata,
  OccupancyGridMap,
  Robot,
  Station,
  TaskHistoryEntry,
  TaskStatus,
  TaskEstimate,
  TaskCreateInput,
  TaskRoutePreview,
  TaskRoutePreviewInput,
  UserIdentity
  , Notification, NotificationPage, AuditRecord
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
  priority: DeliveryTask["priority"];
  recipient_name: string | null;
  delivery_note: string | null;
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

type ApiTaskEstimate = {
  start_eta_seconds: number | null;
  task_id: string;
  status: TaskStatus;
  queue_position: number | null;
  pickup_eta_seconds: number | null;
  destination_eta_seconds: number | null;
  generated_at: string;
  availability: TaskEstimate["availability"];
  completed_at: string | null;
};

type ApiTaskRoutePreview = {
  preview_id: string;
  robot_id: string;
  status: "AVAILABLE";
  frame_id: string;
  map_revision: number;
  pickup_path: Array<{ x: number; y: number; yaw?: number }>;
  delivery_path: Array<{ x: number; y: number; yaw?: number }>;
  pickup_distance_meters: number;
  delivery_distance_meters: number;
  total_distance_meters: number;
  travel_time_seconds: number;
  pickup_eta_seconds: number;
  destination_eta_seconds: number;
  completion_eta_seconds: number;
  generated_at: string;
  expires_at: string;
};

type ApiOverview = {
  global_queued_count: number;
  robot_available_seconds: number | null;
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
    ownerId: task.owner_id ?? undefined,
    priority: task.priority,
    recipientName: task.recipient_name ?? undefined,
    deliveryNote: task.delivery_note ?? undefined
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

export function login(identifier: string, password: string): Promise<UserIdentity> {
  return request<UserIdentity>("/api/auth/login", {
    method: "POST", body: JSON.stringify({ identifier, password })
  });
}

export function signup(input: {email:string;username:string;password:string}): Promise<{status:"PENDING_APPROVAL"}> {
  return request("/api/auth/signup", {method:"POST",body:JSON.stringify(input)});
}

export function forgotPassword(email: string): Promise<{accepted:boolean;delivery_configured:boolean}> {
  return request("/api/auth/forgot-password", {method:"POST",body:JSON.stringify({email})});
}

export function resetPassword(token: string, password: string): Promise<void> {
  return request("/api/auth/reset-password", {method:"POST",body:JSON.stringify({token,password})});
}

export function getGoogleAuthConfiguration(): Promise<{enabled:boolean}> {
  return request("/api/auth/google/config");
}

export const GOOGLE_AUTH_START_URL = `${API_BASE_URL}/api/auth/google/start`;

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
    globalQueuedCount: data.global_queued_count,
    robotAvailableSeconds: data.robot_available_seconds ?? undefined,
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

type ApiMapMetadata = {
  map_name: string;
  building: string;
  floor: string;
  area_description: string | null;
  updated_at: string;
};

function toMapMetadata(metadata: ApiMapMetadata): MapMetadata {
  return {
    mapName: metadata.map_name,
    building: metadata.building,
    floor: metadata.floor,
    areaDescription: metadata.area_description ?? undefined,
    updatedAt: metadata.updated_at,
  };
}

export async function getMapMetadata(): Promise<MapMetadata> {
  return toMapMetadata(await request<ApiMapMetadata>("/api/map/metadata"));
}

export async function updateMapMetadata(
  metadata: Omit<MapMetadata, "updatedAt">
): Promise<MapMetadata> {
  return toMapMetadata(await request<ApiMapMetadata>("/api/map/metadata", {
    method: "PUT",
    body: JSON.stringify({
      map_name: metadata.mapName,
      building: metadata.building,
      floor: metadata.floor,
      area_description: metadata.areaDescription ?? null,
    }),
  }));
}
export async function getTasks(): Promise<DeliveryTask[]> {
  const tasks = await request<ApiDeliveryTask[]>("/api/tasks");
  return tasks.map(toTask);
}

export async function getTaskEstimates(): Promise<TaskEstimate[]> {
  const estimates = await request<ApiTaskEstimate[]>("/api/tasks/estimates");
  return estimates.map((estimate) => ({
    startEtaSeconds: estimate.start_eta_seconds ?? undefined,
    taskId: estimate.task_id,
    status: estimate.status,
    queuePosition: estimate.queue_position ?? undefined,
    pickupEtaSeconds: estimate.pickup_eta_seconds ?? undefined,
    destinationEtaSeconds: estimate.destination_eta_seconds ?? undefined,
    generatedAt: estimate.generated_at,
    availability: estimate.availability,
    completedAt: estimate.completed_at ?? undefined
  }));
}

export async function getTaskHistory(taskId: string): Promise<TaskHistoryEntry[]> {
  const history = await request<ApiTaskHistoryEntry[]>(`/api/tasks/${taskId}/history`);
  return history.map(toHistory);
}

export async function createTask(
  input: TaskCreateInput
): Promise<DeliveryTask> {
  const task = await request<ApiDeliveryTask>("/api/tasks", {
    method: "POST",
    body: JSON.stringify({
      pickup_station_id: input.pickupStationId,
      destination_station_id: input.destinationStationId,
      priority: input.priority,
      recipient_name: input.recipientName?.trim() || null,
      delivery_note: input.deliveryNote?.trim() || null,
      preview_id: input.previewId
    })
  });
  return toTask(task);
}

export async function previewTaskRoute(
  input: TaskRoutePreviewInput
): Promise<TaskRoutePreview> {
  const preview = await request<ApiTaskRoutePreview>("/api/tasks/preview", {
    method: "POST",
    body: JSON.stringify({
      pickup_station_id: input.pickupStationId,
      destination_station_id: input.destinationStationId,
      priority: input.priority
    })
  });
  return {
    previewId: preview.preview_id,
    robotId: preview.robot_id,
    status: preview.status,
    frameId: preview.frame_id,
    mapRevision: preview.map_revision,
    pickupPath: preview.pickup_path,
    deliveryPath: preview.delivery_path,
    pickupDistanceMeters: preview.pickup_distance_meters,
    deliveryDistanceMeters: preview.delivery_distance_meters,
    totalDistanceMeters: preview.total_distance_meters,
    travelTimeSeconds: preview.travel_time_seconds,
    pickupEtaSeconds: preview.pickup_eta_seconds,
    destinationEtaSeconds: preview.destination_eta_seconds,
    completionEtaSeconds: preview.completion_eta_seconds,
    generatedAt: preview.generated_at,
    expiresAt: preview.expires_at
  };
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

export async function updateStation(
  stationId: string,
  station: Omit<Station, "id">
): Promise<Station> {
  return request<Station>(`/api/stations/${stationId}`, {
    method: "PUT",
    body: JSON.stringify(station)
  });
}

export async function deleteStation(stationId: string): Promise<void> {
  await request<void>(`/api/stations/${stationId}`, { method: "DELETE" });
}

type ApiNotification = { id: string; event_type: string; title: string; message: string; entity_type: string | null; entity_id: string | null; read_at: string | null; created_at: string };
const toNotification = (item: ApiNotification): Notification => ({ id: item.id, eventType: item.event_type, title: item.title, message: item.message, entityType: item.entity_type ?? undefined, entityId: item.entity_id ?? undefined, readAt: item.read_at ?? undefined, createdAt: item.created_at });
export async function getNotifications(offset = 0, limit = 30): Promise<NotificationPage> {
  const page = await request<{items: ApiNotification[]; unread_count: number; next_offset: number | null}>(`/api/notifications?offset=${offset}&limit=${limit}`);
  return {items: page.items.map(toNotification), unreadCount: page.unread_count, nextOffset: page.next_offset ?? undefined};
}
export async function markNotificationRead(id: string): Promise<Notification> { return toNotification(await request<ApiNotification>(`/api/notifications/${id}/read`, {method: "POST"})); }
export async function markAllNotificationsRead(): Promise<void> { await request<void>("/api/notifications/read-all", {method: "POST"}); }
export async function getAudit(offset = 0, limit = 30, action?: string): Promise<{items: AuditRecord[]; nextOffset?: number}> {
  const query = new URLSearchParams({offset: String(offset), limit: String(limit)}); if (action) query.set("action", action);
  const page = await request<{items: Array<{id:number;actor_id:string|null;actor_type:"USER"|"ROBOT"|"SYSTEM";actor_identifier:string|null;action:string;result:string;entity_type:string;entity_id:string|null;metadata_json:string;created_at:string}>;next_offset:number|null}>(`/api/audit?${query}`);
  return {items: page.items.map((item) => ({id:item.id,actorId:item.actor_id ?? undefined,actorType:item.actor_type,actorIdentifier:item.actor_identifier ?? undefined,action:item.action,result:item.result,entityType:item.entity_type,entityId:item.entity_id ?? undefined,metadataJson:item.metadata_json,createdAt:item.created_at})),nextOffset:page.next_offset ?? undefined};
}
