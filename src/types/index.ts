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

export type TaskPriority = "NORMAL" | "HIGH";
export type BatterySource = "SENSOR" | "SIMULATED" | "UNAVAILABLE";

export interface TaskCreateInput {
  pickupStationId: string;
  destinationStationId: string;
  priority: TaskPriority;
  recipientName?: string;
  deliveryNote?: string;
  previewId: string;
  robotId?: string;
}

export interface TaskRoutePreviewInput {
  pickupStationId: string;
  destinationStationId: string;
  priority: TaskPriority;
  robotId?: string;
}

export interface TaskRoutePreview {
  previewId: string;
  robotId: string;
  status: "AVAILABLE";
  frameId: string;
  mapRevision: number;
  pickupPath: NavigationPathPose[];
  deliveryPath: NavigationPathPose[];
  pickupDistanceMeters: number;
  deliveryDistanceMeters: number;
  totalDistanceMeters: number;
  travelTimeSeconds: number;
  pickupEtaSeconds: number;
  destinationEtaSeconds: number;
  completionEtaSeconds: number;
  queuePosition: number;
  estimatedStartSeconds?: number;
  generatedAt: string;
  expiresAt: string;
}

export interface Station {
  id: string;
  mapId: string;
  name: string;
  x: number;
  y: number;
  yaw: number;
  description?: string;
  location?: string;
  instructions?: string;
}

export interface MapMetadata {
  mapName: string;
  building: string;
  floor: string;
  areaDescription?: string;
  updatedAt: string;
}

export interface RobotMapRecord {
  id: string;
  name: string;
  yamlFile: string;
  imageFile?: string;
  resolution?: number;
  sizeBytes: number;
  modifiedAt?: string;
  available: boolean;
  active: boolean;
  issue?: string;
  building?: string;
  floor?: string;
  areaDescription?: string;
}

export interface RobotMapCatalog {
  robotId: string;
  source: "ROS_FILESYSTEM";
  activeMapId?: string;
  generatedAt: string;
  receivedAt: string;
  robotOnline: boolean;
  maps: RobotMapRecord[];
}

export type MapSwitchStatus = "PENDING" | "SUCCEEDED" | "FAILED";

export interface MapSwitchOperation {
  commandId: string;
  robotId: string;
  mapId: string;
  status: MapSwitchStatus;
  detail?: string;
  requestedAt: string;
  completedAt?: string;
  deadline: string;
}

export type MapCatalogAction = "UPDATE_METADATA" | "RENAME" | "DELETE";

export interface MapCatalogOperation extends MapSwitchOperation {
  action: MapCatalogAction;
  resultMapId?: string;
}

export interface RobotMapDetails {
  name: string;
  building?: string;
  floor?: string;
  areaDescription?: string;
}

export type MappingPhase = "IDLE" | "STARTING" | "MAPPING" | "STOPPING" | "REVIEW" | "SAVING" | "RESTORING" | "FAILED";

export interface MappingSession {
  robotId: string;
  sessionId?: string;
  phase: MappingPhase;
  detail?: string;
  startedAt?: string;
  updatedAt: string;
  savedMapId?: string;
  mapRevision?: number;
}

export interface MappingMapDetails extends RobotMapDetails {
  mapId: string;
}

export type LocalizationHealth = "UNKNOWN" | "LOCALIZED" | "DEGRADED" | "LOST";
export type AmclLifecycleState = "UNKNOWN" | "ACTIVE" | "INACTIVE";
export type LocalizationReason = "READY" | "ROBOT_OFFLINE" | "MAPPING_ACTIVE" | "AMCL_INACTIVE" | "NO_POSE" | "TF_UNAVAILABLE" | "POSE_STALE" | "HIGH_UNCERTAINTY";
export type LocalizationCommandAction = "SET_INITIAL_POSE" | "GLOBAL_LOCALIZATION";

export interface LocalizationPose {
  frameId: string;
  x: number;
  y: number;
  yaw: number;
}

export interface LocalizationStatus {
  robotId: string;
  health: LocalizationHealth;
  reason: LocalizationReason;
  amclState: AmclLifecycleState;
  mapId?: string;
  pose?: LocalizationPose;
  poseAgeSeconds?: number;
  positionUncertainty?: number;
  yawUncertainty?: number;
  tfAvailable: boolean;
  moving: boolean;
  recoveryCount: number;
  recoveryActive: boolean;
  automaticScanActive: boolean;
  automaticScanProgress: number;
  detail?: string;
  pendingCommandId?: string;
  lastCommandId?: string;
  lastCommandAction?: LocalizationCommandAction;
  lastCommandSucceeded?: boolean;
  updatedAt: string;
}

export interface InitialPoseInput {
  robotId?: string;
  pose: LocalizationPose;
  positionUncertainty: number;
  yawUncertainty: number;
}

export interface Robot {
  id: string;
  name: string;
  online: boolean;
  battery: number;
  batterySource: BatterySource;
  state: RobotState;
  x: number;
  y: number;
  yaw: number;
  currentTaskId?: string;
  lastSeen: string;
}

export type FleetUnavailableReason =
  | "ROBOT_OFFLINE"
  | "ROBOT_NOT_PAIRED"
  | "ROBOT_NOT_READY"
  | "NAVIGATION_UNAVAILABLE"
  | "ACTIVE_MAP_UNKNOWN"
  | "EMERGENCY_STOP_ACTIVE"
  | "MAPPING_ACTIVE";

export interface FleetRobot {
  id: string;
  name: string;
  online: boolean;
  state: RobotState;
  battery: number;
  batterySource: BatterySource;
  x: number;
  y: number;
  yaw: number;
  enrollmentStatus: RobotEnrollmentStatus;
  readinessStatus: RobotReadinessStatus;
  capabilities: string[];
  activeMapId?: string;
  currentTaskId?: string;
  queuedCount: number;
  availableNow: boolean;
  acceptsDeliveries: boolean;
  unavailableReason?: FleetUnavailableReason;
}

export type RobotEnrollmentStatus = "UNPAIRED" | "PENDING" | "PAIRED" | "REVOKED";
export type RobotReadinessStatus = "NOT_READY" | "READY" | "DEGRADED";

export interface RobotProfileValidationResult {
  checkId: string;
  category: "INTERFACE" | "DATA" | "TF" | "LIFECYCLE" | "CAPABILITY";
  status: "PASS" | "WARN" | "FAIL";
  message: string;
  observed?: string;
}

export interface RobotEnrollment {
  id: string;
  serialNumber: string;
  fingerprintSha256: string;
  displayName: string;
  agentVersion: string;
  rosDistro: string;
  profileVersion: string;
  capabilities: string[];
  status: RobotEnrollmentStatus;
  expiresAt: string;
  createdAt: string;
  approvedAt?: string;
  claimedAt?: string;
  robotId?: string;
}

export interface RobotRegistryEntry {
  id: string;
  displayName: string;
  serialNumber?: string;
  enrollmentStatus: RobotEnrollmentStatus;
  readinessStatus: RobotReadinessStatus;
  online: boolean;
  profileVersion?: string;
  agentVersion?: string;
  rosDistro?: string;
  capabilities: string[];
  lastBootId?: string;
  credentialVersion?: number;
  credentialRevoked: boolean;
  credentialRotationPending: boolean;
  lastAuthenticatedAt?: string;
  identityVerified: boolean;
  identityAnomalyCode?: string;
  identityAnomalyDetectedAt?: string;
  readinessDetail?: string;
  readinessUpdatedAt?: string;
  validationResults: RobotProfileValidationResult[];
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
  ownerId?: string;
  ownerUsername?: string;
  priority: TaskPriority;
  recipientName?: string;
  deliveryNote?: string;
  pickupDistanceMeters?: number;
  deliveryDistanceMeters?: number;
}

export interface DeliveryTaskPage {
  items: DeliveryTask[];
  total: number;
  offset: number;
  limit: number;
}

export interface TaskEstimate {
  startEtaSeconds?: number;
  taskId: string;
  status: TaskStatus;
  queuePosition?: number;
  pickupEtaSeconds?: number;
  destinationEtaSeconds?: number;
  generatedAt: string;
  availability: "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
  completedAt?: string;
}

export interface UserIdentity {
  id: string;
  username: string;
  role: "ADMIN" | "USER";
}

export interface PendingAccount {
  id: string;
  email: string;
  username: string;
  createdAt: string;
}

export interface PasswordPolicy {
  minimumLength: number;
  requireLetter: boolean;
  requireNumber: boolean;
}

export interface Alert {
  id: string;
  robot_id?: string;
  severity: "INFO" | "WARNING" | "CRITICAL";
  title: string;
  message: string;
  source: string;
  first_occurrence_at: string;
  latest_occurrence_at: string;
  occurrence_count: number;
  acknowledged: boolean;
  acknowledged_at?: string;
  acknowledged_by_user_id?: string;
  active: boolean;
  resolved_at?: string;
}

export interface Notification {
  id: string;
  eventType: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  category: "DELIVERY" | "ACTION_REQUIRED" | "CRITICAL" | "SYSTEM";
  severity: "INFO" | "WARNING" | "CRITICAL";
  actionRequired: boolean;
  readAt?: string;
  createdAt: string;
}

export interface NotificationPage {
  items: Notification[];
  unreadCount: number;
  unreadByCategory: Partial<Record<Notification["category"], number>>;
  nextOffset?: number;
}

export interface AuditRecord {
  id: number;
  actorId?: string;
  actorType: "USER" | "ROBOT" | "SYSTEM";
  actorIdentifier?: string;
  action: string;
  result: string;
  entityType: string;
  entityId?: string;
  metadataJson: string;
  createdAt: string;
}

export interface EmergencyStop {
  robot_id: string;
  state: "NORMAL" | "STOP_REQUESTED" | "STOPPED" | "RESET_REQUESTED" | "FAILED";
  latched: boolean;
  pending_command_id?: string;
  failure_detail?: string;
  activated_at?: string;
  updated_at: string;
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
