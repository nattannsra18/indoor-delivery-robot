import type {
  Alert,
  DeliveryTask,
  DeliveryTaskPage,
  EmergencyStop,
  MapMetadata,
  MapSwitchOperation,
  MapCatalogOperation,
  MappingMapDetails,
  MappingSession,
  RobotMapDetails,
  RobotMapCatalog,
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
  , Notification, NotificationPage, AuditRecord, PendingAccount, PasswordPolicy
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
  battery_source: Robot["batterySource"];
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
  owner_username: string | null;
  priority: DeliveryTask["priority"];
  recipient_name: string | null;
  delivery_note: string | null;
  pickup_distance_meters: number | null;
  delivery_distance_meters: number | null;
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
    batterySource: robot.battery_source ?? "UNAVAILABLE",
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
    ownerUsername: task.owner_username ?? undefined,
    priority: task.priority,
    recipientName: task.recipient_name ?? undefined,
    deliveryNote: task.delivery_note ?? undefined,
    pickupDistanceMeters: task.pickup_distance_meters ?? undefined,
    deliveryDistanceMeters: task.delivery_distance_meters ?? undefined
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

export async function getPasswordPolicy(): Promise<PasswordPolicy> {
  const policy = await request<{minimum_length:number;require_letter:boolean;require_number:boolean}>("/api/auth/password-policy");
  return {
    minimumLength: policy.minimum_length,
    requireLetter: policy.require_letter,
    requireNumber: policy.require_number,
  };
}

export async function getPendingAccounts(): Promise<PendingAccount[]> {
  const accounts = await request<Array<{id:string;email:string;username:string;created_at:string}>>("/api/auth/pending-accounts");
  return accounts.map((account) => ({
    id: account.id,
    email: account.email,
    username: account.username,
    createdAt: account.created_at,
  }));
}

export function approveAccount(userId: string): Promise<UserIdentity> {
  return request<UserIdentity>(`/api/auth/accounts/${userId}/approve`, { method: "POST" });
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

type ApiRobotMapCatalog = {
  robot_id: string;
  source: "ROS_FILESYSTEM";
  active_map_id: string | null;
  generated_at: string;
  received_at: string;
  robot_online: boolean;
  maps: Array<{
    id: string;
    name: string;
    yaml_file: string;
    image_file: string | null;
    resolution: number | null;
    size_bytes: number;
    modified_at: string | null;
    available: boolean;
    active: boolean;
    issue: string | null;
    building: string | null;
    floor: string | null;
    area_description: string | null;
  }>;
};

export async function getMapCatalog(robotId = "robot01"): Promise<RobotMapCatalog> {
  const catalog = await request<ApiRobotMapCatalog>(`/api/map/catalog?robot_id=${encodeURIComponent(robotId)}`);
  return {
    robotId: catalog.robot_id,
    source: catalog.source,
    activeMapId: catalog.active_map_id ?? undefined,
    generatedAt: catalog.generated_at,
    receivedAt: catalog.received_at,
    robotOnline: catalog.robot_online,
    maps: catalog.maps.map((map) => ({
      id: map.id,
      name: map.name,
      yamlFile: map.yaml_file,
      imageFile: map.image_file ?? undefined,
      resolution: map.resolution ?? undefined,
      sizeBytes: map.size_bytes,
      modifiedAt: map.modified_at ?? undefined,
      available: map.available,
      active: map.active,
      issue: map.issue ?? undefined,
      building: map.building ?? undefined,
      floor: map.floor ?? undefined,
      areaDescription: map.area_description ?? undefined,
    })),
  };
}

export async function refreshMapCatalog(robotId = "robot01"): Promise<void> {
  await request(`/api/map/catalog/refresh?robot_id=${encodeURIComponent(robotId)}`, { method: "POST" });
}

type ApiMapSwitchOperation = {
  command_id: string;
  robot_id: string;
  map_id: string;
  status: "PENDING" | "SUCCEEDED" | "FAILED";
  detail: string | null;
  requested_at: string;
  completed_at: string | null;
  deadline: string;
};

function toMapSwitchOperation(value: ApiMapSwitchOperation): MapSwitchOperation {
  return {
    commandId: value.command_id,
    robotId: value.robot_id,
    mapId: value.map_id,
    status: value.status,
    detail: value.detail ?? undefined,
    requestedAt: value.requested_at,
    completedAt: value.completed_at ?? undefined,
    deadline: value.deadline,
  };
}

export async function activateRobotMap(
  mapId: string,
  robotId = "robot01"
): Promise<MapSwitchOperation> {
  const operation = await request<ApiMapSwitchOperation>(
    `/api/map/catalog/${encodeURIComponent(mapId)}/activate?robot_id=${encodeURIComponent(robotId)}`,
    { method: "POST" }
  );
  return toMapSwitchOperation(operation);
}

export async function getMapOperation(
  commandId: string
): Promise<MapSwitchOperation> {
  return toMapSwitchOperation(await request<ApiMapSwitchOperation>(
    `/api/map/operations/${encodeURIComponent(commandId)}`
  ));
}

type ApiMapCatalogOperation = ApiMapSwitchOperation & {
  action: "UPDATE_METADATA" | "RENAME" | "DELETE";
  result_map_id: string | null;
};

function toMapCatalogOperation(value: ApiMapCatalogOperation): MapCatalogOperation {
  return {
    ...toMapSwitchOperation(value),
    action: value.action,
    resultMapId: value.result_map_id ?? undefined,
  };
}

export async function getMapCatalogOperation(commandId: string): Promise<MapCatalogOperation> {
  return toMapCatalogOperation(await request<ApiMapCatalogOperation>(
    `/api/map/catalog-operations/${encodeURIComponent(commandId)}`
  ));
}

export async function updateRobotMapDetails(
  mapId: string,
  details: RobotMapDetails,
  robotId = "robot01"
): Promise<MapCatalogOperation> {
  return toMapCatalogOperation(await request<ApiMapCatalogOperation>(
    `/api/map/catalog/${encodeURIComponent(mapId)}/metadata?robot_id=${encodeURIComponent(robotId)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        name: details.name,
        building: details.building ?? null,
        floor: details.floor ?? null,
        area_description: details.areaDescription ?? null,
      }),
    }
  ));
}

export async function renameRobotMap(
  mapId: string,
  newMapId: string,
  robotId = "robot01"
): Promise<MapCatalogOperation> {
  return toMapCatalogOperation(await request<ApiMapCatalogOperation>(
    `/api/map/catalog/${encodeURIComponent(mapId)}/rename?robot_id=${encodeURIComponent(robotId)}`,
    { method: "POST", body: JSON.stringify({ new_map_id: newMapId }) }
  ));
}

export async function deleteRobotMap(
  mapId: string,
  robotId = "robot01"
): Promise<MapCatalogOperation> {
  return toMapCatalogOperation(await request<ApiMapCatalogOperation>(
    `/api/map/catalog/${encodeURIComponent(mapId)}?robot_id=${encodeURIComponent(robotId)}`,
    { method: "DELETE" }
  ));
}

type ApiMappingSession = {
  robot_id: string;
  session_id: string | null;
  phase: MappingSession["phase"];
  detail: string | null;
  started_at: string | null;
  updated_at: string;
  saved_map_id: string | null;
  map_revision: number | null;
};

function toMappingSession(value: ApiMappingSession): MappingSession {
  return {
    robotId: value.robot_id,
    sessionId: value.session_id ?? undefined,
    phase: value.phase,
    detail: value.detail ?? undefined,
    startedAt: value.started_at ?? undefined,
    updatedAt: value.updated_at,
    savedMapId: value.saved_map_id ?? undefined,
    mapRevision: value.map_revision ?? undefined,
  };
}

export async function getMappingStatus(robotId = "robot01"): Promise<MappingSession> {
  return toMappingSession(await request<ApiMappingSession>(`/api/mapping/status?robot_id=${encodeURIComponent(robotId)}`));
}

export async function startMapping(robotId = "robot01"): Promise<MappingSession> {
  return toMappingSession(await request<ApiMappingSession>("/api/mapping/start", {
    method: "POST", body: JSON.stringify({ robot_id: robotId }),
  }));
}

export async function stopMapping(robotId = "robot01"): Promise<MappingSession> {
  return toMappingSession(await request<ApiMappingSession>(`/api/mapping/stop?robot_id=${encodeURIComponent(robotId)}`, { method: "POST" }));
}

export async function discardMapping(robotId = "robot01"): Promise<MappingSession> {
  return toMappingSession(await request<ApiMappingSession>(`/api/mapping/discard?robot_id=${encodeURIComponent(robotId)}`, { method: "POST" }));
}

export async function saveMapping(details: MappingMapDetails, robotId = "robot01"): Promise<MappingSession> {
  return toMappingSession(await request<ApiMappingSession>(`/api/mapping/save?robot_id=${encodeURIComponent(robotId)}`, {
    method: "POST",
    body: JSON.stringify({
      map_id: details.mapId, name: details.name, building: details.building ?? null,
      floor: details.floor ?? null, area_description: details.areaDescription ?? null,
    }),
  }));
}

export async function driveMappingRobot(linearX: number, angularZ: number, robotId = "robot01"): Promise<void> {
  await request(`/api/mapping/teleop?robot_id=${encodeURIComponent(robotId)}`, {
    method: "POST", body: JSON.stringify({ linear_x: linearX, angular_z: angularZ }),
  });
}
export async function getTasks(): Promise<DeliveryTask[]> {
  const tasks = await request<ApiDeliveryTask[]>("/api/tasks");
  return tasks.map(toTask);
}

export async function getTask(taskId: string): Promise<DeliveryTask> {
  return toTask(await request<ApiDeliveryTask>(`/api/tasks/${encodeURIComponent(taskId)}`));
}

export async function getTaskPage(options: {status?: TaskStatus; query?: string; offset?: number; limit?: number} = {}): Promise<DeliveryTaskPage> {
  const parameters = new URLSearchParams({
    offset: String(options.offset ?? 0),
    limit: String(options.limit ?? 20),
  });
  if (options.status) parameters.set("status", options.status);
  if (options.query?.trim()) parameters.set("query", options.query.trim());
  const page = await request<{items: ApiDeliveryTask[]; total: number; offset: number; limit: number}>(`/api/tasks/page?${parameters}`);
  return {...page, items: page.items.map(toTask)};
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

type ApiNotification = { id: string; event_type: string; title: string; message: string; entity_type: string | null; entity_id: string | null; category: Notification["category"]; severity: Notification["severity"]; action_required: boolean; read_at: string | null; created_at: string };
const toNotification = (item: ApiNotification): Notification => ({ id: item.id, eventType: item.event_type, title: item.title, message: item.message, entityType: item.entity_type ?? undefined, entityId: item.entity_id ?? undefined, category: item.category, severity: item.severity, actionRequired: item.action_required, readAt: item.read_at ?? undefined, createdAt: item.created_at });
export async function getNotifications(offset = 0, limit = 30, options: {category?: Notification["category"]; unreadOnly?: boolean} = {}): Promise<NotificationPage> {
  const parameters = new URLSearchParams({offset: String(offset), limit: String(limit)});
  if (options.category) parameters.set("category", options.category);
  if (options.unreadOnly) parameters.set("unread_only", "true");
  const page = await request<{items: ApiNotification[]; unread_count: number; unread_by_category: Partial<Record<Notification["category"], number>>; next_offset: number | null}>(`/api/notifications?${parameters}`);
  return {items: page.items.map(toNotification), unreadCount: page.unread_count, unreadByCategory: page.unread_by_category, nextOffset: page.next_offset ?? undefined};
}
export async function markNotificationRead(id: string): Promise<Notification> { return toNotification(await request<ApiNotification>(`/api/notifications/${id}/read`, {method: "POST"})); }
export async function markNotificationsRead(ids: string[]): Promise<Notification[]> { return (await request<ApiNotification[]>("/api/notifications/read-many", {method: "POST", body: JSON.stringify({ids})})).map(toNotification); }
export async function markAllNotificationsRead(): Promise<void> { await request<void>("/api/notifications/read-all", {method: "POST"}); }
export async function getAudit(offset = 0, limit = 30, action?: string): Promise<{items: AuditRecord[]; nextOffset?: number}> {
  const query = new URLSearchParams({offset: String(offset), limit: String(limit)}); if (action) query.set("action", action);
  const page = await request<{items: Array<{id:number;actor_id:string|null;actor_type:"USER"|"ROBOT"|"SYSTEM";actor_identifier:string|null;action:string;result:string;entity_type:string;entity_id:string|null;metadata_json:string;created_at:string}>;next_offset:number|null}>(`/api/audit?${query}`);
  return {items: page.items.map((item) => ({id:item.id,actorId:item.actor_id ?? undefined,actorType:item.actor_type,actorIdentifier:item.actor_identifier ?? undefined,action:item.action,result:item.result,entityType:item.entity_type,entityId:item.entity_id ?? undefined,metadataJson:item.metadata_json,createdAt:item.created_at})),nextOffset:page.next_offset ?? undefined};
}
