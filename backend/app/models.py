from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Literal, Optional
from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)


class TaskStatus(str, Enum):
    QUEUED = "QUEUED"
    GOING_TO_PICKUP = "GOING_TO_PICKUP"
    WAITING_FOR_LOADING = "WAITING_FOR_LOADING"
    DELIVERING = "DELIVERING"
    WAITING_FOR_UNLOADING = "WAITING_FOR_UNLOADING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class TaskPriority(str, Enum):
    NORMAL = "NORMAL"
    HIGH = "HIGH"


class TaskEstimateAvailability(str, Enum):
    AVAILABLE = "AVAILABLE"
    PARTIAL = "PARTIAL"
    UNAVAILABLE = "UNAVAILABLE"


class RobotState(str, Enum):
    IDLE = "IDLE"
    GOING_TO_PICKUP = "GOING_TO_PICKUP"
    WAITING_FOR_LOADING = "WAITING_FOR_LOADING"
    DELIVERING = "DELIVERING"
    WAITING_FOR_UNLOADING = "WAITING_FOR_UNLOADING"
    ERROR = "ERROR"
    OFFLINE = "OFFLINE"


class BatterySource(str, Enum):
    SENSOR = "SENSOR"
    SIMULATED = "SIMULATED"
    UNAVAILABLE = "UNAVAILABLE"


class NotificationCategory(str, Enum):
    DELIVERY = "DELIVERY"
    ACTION_REQUIRED = "ACTION_REQUIRED"
    CRITICAL = "CRITICAL"
    SYSTEM = "SYSTEM"


class TaskEvent(str, Enum):
    ARRIVED_PICKUP = "ARRIVED_PICKUP"
    CONFIRM_LOADED = "CONFIRM_LOADED"
    ARRIVED_DESTINATION = "ARRIVED_DESTINATION"
    CONFIRM_RECEIVED = "CONFIRM_RECEIVED"
    NAVIGATION_FAILED = "NAVIGATION_FAILED"


class EventSource(str, Enum):
    WEB_OPERATOR = "WEB_OPERATOR"
    ROBOT_AGENT = "ROBOT_AGENT"
    SYSTEM = "SYSTEM"


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    USER = "USER"


class AlertSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class EmergencyStopState(str, Enum):
    NORMAL = "NORMAL"
    STOP_REQUESTED = "STOP_REQUESTED"
    STOPPED = "STOPPED"
    RESET_REQUESTED = "RESET_REQUESTED"
    FAILED = "FAILED"


class UserIdentity(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    username: str
    role: UserRole


class LoginRequest(BaseModel):
    identifier: Optional[str] = Field(default=None, min_length=1, max_length=320)
    username: Optional[str] = Field(default=None, min_length=1, max_length=320)
    password: str = Field(min_length=1, max_length=1024)

    @model_validator(mode="after")
    def require_identifier(self):
        if not (self.identifier or self.username):
            raise ValueError("Email or username is required")
        return self

    @property
    def login_identifier(self) -> str:
        return (self.identifier or self.username or "").strip()


class SignupRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    username: str = Field(min_length=3, max_length=100, pattern=r"^[A-Za-z0-9_.-]+$")
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        normalized = value.strip().casefold()
        local, separator, domain = normalized.rpartition("@")
        if not separator or not local or "." not in domain:
            raise ValueError("Enter a valid email address")
        return normalized

    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str:
        return value.strip()

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        from .config import security_settings

        minimum = security_settings().password_min_length
        if len(value) < minimum:
            raise ValueError(f"Password must contain at least {minimum} characters")
        if not any(character.isalpha() for character in value):
            raise ValueError("Password must contain at least one letter")
        if not any(character.isdigit() for character in value):
            raise ValueError("Password must contain at least one number")
        return value


class SignupResult(BaseModel):
    status: Literal["PENDING_APPROVAL"]


class PendingAccount(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    username: str
    created_at: datetime


class PasswordPolicy(BaseModel):
    minimum_length: int = Field(ge=8)
    require_letter: bool = True
    require_number: bool = True


class ForgotPasswordRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)


class ForgotPasswordResult(BaseModel):
    accepted: bool
    delivery_configured: bool


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=32, max_length=500)
    password: str = Field(min_length=1, max_length=1024)

    @field_validator("password")
    @classmethod
    def validate_password(cls, value: str) -> str:
        return SignupRequest.validate_password(value)


class GoogleAuthConfiguration(BaseModel):
    enabled: bool


class Station(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    x: float
    y: float
    yaw: float
    description: Optional[str] = None
    location: Optional[str] = None
    instructions: Optional[str] = None


class StationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    x: float
    y: float
    yaw: float
    description: Optional[str] = Field(default=None, max_length=200)
    location: Optional[str] = Field(default=None, max_length=200)
    instructions: Optional[str] = Field(default=None, max_length=400)


class StationUpdate(StationCreate):
    pass


class MapMetadata(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    map_name: str
    building: str
    floor: str
    area_description: Optional[str] = None
    updated_at: datetime


class MapMetadataUpdate(BaseModel):
    map_name: str = Field(min_length=1, max_length=120)
    building: str = Field(min_length=1, max_length=120)
    floor: str = Field(min_length=1, max_length=80)
    area_description: Optional[str] = Field(default=None, max_length=240)


class Robot(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    online: bool
    battery: int = Field(ge=0, le=100)
    battery_source: BatterySource = BatterySource.UNAVAILABLE
    state: RobotState
    x: float
    y: float
    yaw: float
    current_task_id: Optional[str] = None
    last_seen: str


class EmergencyStop(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    robot_id: str
    state: EmergencyStopState
    latched: bool
    pending_command_id: Optional[str] = None
    failure_detail: Optional[str] = None
    activated_at: Optional[datetime] = None
    updated_at: datetime

class RobotTelemetry(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    x: float
    y: float
    yaw: float
    battery: int = Field(ge=0, le=100)
    battery_source: BatterySource = BatterySource.SIMULATED
    frame_id: str = Field(
        default="map",
        min_length=1,
        max_length=100,
    )
    timestamp: Optional[str] = None


DiagnosticLevel = Literal[
    "OK",
    "WARN",
    "ERROR",
    "STALE",
]


class DiagnosticKeyValue(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )

    key: str = Field(min_length=1, max_length=200)
    value: str = Field(max_length=1000)


class DiagnosticStatusPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )

    name: str = Field(min_length=1, max_length=200)
    level: DiagnosticLevel
    message: str = Field(max_length=500)
    hardware_id: str = Field(max_length=200)
    values: list[DiagnosticKeyValue] = Field(
        default_factory=list,
        max_length=100,
    )


class DiagnosticsMessage(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )

    type: Literal["diagnostics"]
    timestamp: Optional[str] = Field(
        default=None,
        max_length=100,
    )
    statuses: list[DiagnosticStatusPayload] = Field(
        max_length=100,
    )

    @field_validator("timestamp")
    @classmethod
    def validate_timestamp(
        cls,
        value: Optional[str],
    ) -> Optional[str]:
        if value is None:
            return value

        try:
            datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )
        except ValueError as error:
            raise ValueError(
                "timestamp must be ISO-8601"
            ) from error

        return value


class NavigationResultMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["navigation_result"]
    command_id: str = Field(
        min_length=1,
        max_length=200,
    )
    task_id: str = Field(
        min_length=1,
        max_length=100,
    )
    stage: Literal["pickup", "destination"]
    status: Literal[
        "succeeded",
        "aborted",
        "canceled",
    ]
    detail: Optional[str] = Field(
        default=None,
        max_length=500,
    )

class NavigationFeedbackPose(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    frame_id: str = Field(
        default="map",
        min_length=1,
        max_length=100,
    )
    x: float
    y: float
    yaw: float


class NavigationFeedbackMessage(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    type: Literal["navigation_feedback"]
    command_id: str = Field(
        min_length=1,
        max_length=200,
    )
    task_id: str = Field(
        min_length=1,
        max_length=100,
    )
    stage: Literal[
        "pickup",
        "destination",
    ]
    distance_remaining: float = Field(
        ge=0.0
    )
    navigation_time_seconds: float = Field(
        ge=0.0
    )
    estimated_time_remaining_seconds: (
        Optional[float]
    ) = Field(
        default=None,
        ge=0.0,
    )
    number_of_recoveries: int = Field(
        ge=0
    )
    linear_velocity: Optional[float] = Field(
        default=None,
        ge=0.0,
    )
    angular_velocity: Optional[float] = None
    current_pose: NavigationFeedbackPose
    timestamp: Optional[str] = None


NavigationStage = Literal["pickup", "destination"]
MAX_NAVIGATION_PATH_POSES = 500


class NavigationPathPose(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
        strict=True,
    )

    x: float
    y: float
    yaw: Optional[float] = None


class NavigationPathMessage(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
        strict=True,
    )

    type: Literal["navigation_path"]
    command_id: str = Field(min_length=1, max_length=200)
    task_id: str = Field(min_length=1, max_length=100)
    stage: NavigationStage
    frame_id: str = Field(min_length=1, max_length=100)
    timestamp: str = Field(min_length=1, max_length=100)
    poses: list[NavigationPathPose] = Field(
        min_length=1,
        max_length=MAX_NAVIGATION_PATH_POSES,
    )

    @field_validator("timestamp")
    @classmethod
    def validate_path_timestamp(cls, value: str) -> str:
        try:
            parsed = datetime.fromisoformat(
                value.replace("Z", "+00:00")
            )
        except ValueError as error:
            raise ValueError(
                "timestamp must be ISO-8601"
            ) from error

        if parsed.tzinfo is None:
            raise ValueError(
                "timestamp must include a timezone"
            )

        return value


class NavigationPathClearMessage(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        strict=True,
    )

    type: Literal["navigation_path_clear"]
    command_id: str = Field(min_length=1, max_length=200)
    task_id: str = Field(min_length=1, max_length=100)
    stage: NavigationStage


class RoutePreviewResultMessage(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
        strict=True,
    )

    type: Literal["route_preview_result"]
    request_id: str = Field(min_length=1, max_length=100)
    status: Literal["available", "unreachable", "unavailable"]
    frame_id: Optional[str] = Field(default=None, max_length=100)
    pickup_path: list[NavigationPathPose] = Field(
        default_factory=list,
        max_length=MAX_NAVIGATION_PATH_POSES,
    )
    delivery_path: list[NavigationPathPose] = Field(
        default_factory=list,
        max_length=MAX_NAVIGATION_PATH_POSES,
    )
    detail: Optional[str] = Field(default=None, max_length=500)


class OccupancyGridPayload(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        allow_inf_nan=False,
    )

    frame_id: str = Field(
        default="map",
        min_length=1,
        max_length=100,
    )
    resolution: float = Field(gt=0.0, le=10.0)
    width: int = Field(gt=0, le=10000)
    height: int = Field(gt=0, le=10000)
    origin_x: float
    origin_y: float
    origin_yaw: float
    data: list[int]
    timestamp: Optional[str] = None

    @model_validator(mode="after")
    def validate_occupancy_data(self):
        expected_size = self.width * self.height

        if len(self.data) != expected_size:
            raise ValueError(
                "occupancy data length must equal "
                "width multiplied by height"
            )

        if any(value < -1 or value > 100 for value in self.data):
            raise ValueError(
                "occupancy values must be between -1 and 100"
            )

        return self


class MapMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["map"]
    data: OccupancyGridPayload


class MapSnapshot(OccupancyGridPayload):
    revision: int = Field(ge=1)
    received_at: datetime


class RobotMapRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, max_length=120, pattern=r"^[A-Za-z0-9_.-]+$")
    name: str = Field(min_length=1, max_length=160)
    yaml_file: str = Field(min_length=1, max_length=255)
    image_file: Optional[str] = Field(default=None, max_length=255)
    resolution: Optional[float] = Field(default=None, gt=0.0, le=10.0)
    size_bytes: int = Field(default=0, ge=0)
    modified_at: Optional[datetime] = None
    available: bool
    active: bool
    issue: Optional[str] = Field(default=None, max_length=300)
    building: Optional[str] = Field(default=None, max_length=120)
    floor: Optional[str] = Field(default=None, max_length=80)
    area_description: Optional[str] = Field(default=None, max_length=240)


class RobotMapCatalogPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    robot_id: str = Field(min_length=1, max_length=100)
    source: Literal["ROS_FILESYSTEM"] = "ROS_FILESYSTEM"
    active_map_id: Optional[str] = Field(default=None, max_length=120)
    generated_at: datetime
    maps: list[RobotMapRecord] = Field(max_length=500)


class RobotMapCatalogMessage(RobotMapCatalogPayload):
    type: Literal["map_catalog"]


class RobotMapCatalog(RobotMapCatalogPayload):
    received_at: datetime
    robot_online: bool


class MapSwitchStatus(str, Enum):
    PENDING = "PENDING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class MapSwitchOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    command_id: str = Field(min_length=1, max_length=100)
    robot_id: str = Field(min_length=1, max_length=100)
    map_id: str = Field(min_length=1, max_length=120)
    status: MapSwitchStatus
    detail: Optional[str] = Field(default=None, max_length=300)
    requested_at: datetime
    completed_at: Optional[datetime] = None
    deadline: datetime


class RobotMapSwitchResultMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["map_switch_result"]
    command_id: str = Field(min_length=1, max_length=100)
    robot_id: str = Field(min_length=1, max_length=100)
    map_id: str = Field(min_length=1, max_length=120)
    accepted: bool
    detail: Optional[str] = Field(default=None, max_length=300)


class RobotMapDetailsUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    building: Optional[str] = Field(default=None, max_length=120)
    floor: Optional[str] = Field(default=None, max_length=80)
    area_description: Optional[str] = Field(default=None, max_length=240)


class RobotMapRenameRequest(BaseModel):
    new_map_id: str = Field(
        min_length=1,
        max_length=120,
        pattern=r"^[A-Za-z0-9_.-]+$",
    )


class MapCatalogAction(str, Enum):
    UPDATE_METADATA = "UPDATE_METADATA"
    RENAME = "RENAME"
    DELETE = "DELETE"


class MapCatalogOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    command_id: str = Field(min_length=1, max_length=100)
    robot_id: str = Field(min_length=1, max_length=100)
    map_id: str = Field(min_length=1, max_length=120)
    action: MapCatalogAction
    status: MapSwitchStatus
    result_map_id: Optional[str] = Field(default=None, max_length=120)
    detail: Optional[str] = Field(default=None, max_length=300)
    requested_at: datetime
    completed_at: Optional[datetime] = None
    deadline: datetime


class RobotMapCatalogOperationResultMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: Literal["map_catalog_operation_result"]
    command_id: str = Field(min_length=1, max_length=100)
    robot_id: str = Field(min_length=1, max_length=100)
    map_id: str = Field(min_length=1, max_length=120)
    action: MapCatalogAction
    accepted: bool
    result_map_id: Optional[str] = Field(default=None, max_length=120)
    detail: Optional[str] = Field(default=None, max_length=300)


class DeliveryTask(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    robot_id: Optional[str] = None
    pickup_station_id: str
    destination_station_id: str
    status: TaskStatus
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    progress: int = Field(ge=0, le=100)
    owner_id: Optional[str] = None
    owner_username: Optional[str] = None
    priority: TaskPriority = TaskPriority.NORMAL
    recipient_name: Optional[str] = None
    delivery_note: Optional[str] = None
    pickup_distance_meters: Optional[float] = Field(default=None, ge=0.0)
    delivery_distance_meters: Optional[float] = Field(default=None, ge=0.0)


class DeliveryTaskPage(BaseModel):
    items: list[DeliveryTask]
    total: int = Field(ge=0)
    offset: int = Field(ge=0)
    limit: int = Field(ge=1, le=100)


class TaskEstimate(BaseModel):
    task_id: str
    status: TaskStatus
    queue_position: Optional[int] = Field(default=None, ge=1)
    start_eta_seconds: Optional[float] = Field(default=None, ge=0)
    pickup_eta_seconds: Optional[float] = Field(default=None, ge=0)
    destination_eta_seconds: Optional[float] = Field(default=None, ge=0)
    generated_at: datetime
    availability: TaskEstimateAvailability
    completed_at: Optional[datetime] = None


class Alert(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    deduplication_key: str
    robot_id: Optional[str] = None
    severity: AlertSeverity
    title: str
    message: str
    source: str
    first_occurrence_at: datetime
    latest_occurrence_at: datetime
    occurrence_count: int
    acknowledged: bool
    acknowledged_at: Optional[datetime] = None
    acknowledged_by_user_id: Optional[str] = None
    active: bool
    resolved_at: Optional[datetime] = None


class Notification(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    event_type: str
    title: str
    message: str
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    category: NotificationCategory
    severity: AlertSeverity
    action_required: bool
    read_at: Optional[datetime] = None
    created_at: datetime


class NotificationPage(BaseModel):
    items: list[Notification]
    unread_count: int
    unread_by_category: dict[NotificationCategory, int] = Field(default_factory=dict)
    next_offset: Optional[int] = None


class NotificationReadRequest(BaseModel):
    ids: list[str] = Field(min_length=1, max_length=100)


class AuditRecord(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    actor_id: Optional[str] = None
    actor_type: str = "SYSTEM"
    actor_identifier: Optional[str] = None
    action: str
    result: str
    entity_type: str
    entity_id: Optional[str] = None
    metadata_json: str
    created_at: datetime


class AuditPage(BaseModel):
    items: list[AuditRecord]
    next_offset: Optional[int] = None


class DeliveryTaskCreate(BaseModel):
    pickup_station_id: str
    destination_station_id: str
    priority: TaskPriority = TaskPriority.NORMAL
    recipient_name: Optional[str] = Field(default=None, max_length=100)
    delivery_note: Optional[str] = Field(default=None, max_length=500)
    preview_id: Optional[str] = Field(default=None, min_length=1, max_length=100)

    @field_validator("recipient_name", "delivery_note", mode="before")
    @classmethod
    def normalize_optional_text(cls, value):
        if value is None:
            return None
        if not isinstance(value, str):
            return value
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def validate_stations(self):
        if self.pickup_station_id == self.destination_station_id:
            raise ValueError("pickup_station_id and destination_station_id must be different")
        return self


class TaskRoutePreviewRequest(BaseModel):
    pickup_station_id: str
    destination_station_id: str
    priority: TaskPriority = TaskPriority.NORMAL

    @model_validator(mode="after")
    def validate_stations(self):
        if self.pickup_station_id == self.destination_station_id:
            raise ValueError("pickup_station_id and destination_station_id must be different")
        return self


class TaskRoutePreview(BaseModel):
    preview_id: str
    robot_id: str
    status: Literal["AVAILABLE"]
    frame_id: str
    map_revision: int = Field(ge=1)
    pickup_path: list[NavigationPathPose]
    delivery_path: list[NavigationPathPose]
    pickup_distance_meters: float = Field(ge=0.0)
    delivery_distance_meters: float = Field(ge=0.0)
    total_distance_meters: float = Field(ge=0.0)
    travel_time_seconds: float = Field(ge=0.0)
    pickup_eta_seconds: float = Field(ge=0.0)
    destination_eta_seconds: float = Field(ge=0.0)
    completion_eta_seconds: float = Field(ge=0.0)
    generated_at: datetime
    expires_at: datetime


class TaskEventRequest(BaseModel):
    event: TaskEvent
    detail: Optional[str] = Field(
        default=None,
        max_length=500,
    )


class TaskHistoryEntry(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: str
    event_type: str
    from_status: Optional[TaskStatus] = None
    to_status: TaskStatus
    source: str
    detail: Optional[str] = None
    created_at: datetime


class DashboardOverview(BaseModel):
    global_queued_count: int = 0
    robot_available_seconds: Optional[float] = None
    robot: Robot
    active_task: Optional[DeliveryTask]
    queued_count: int
    completed_count: int
    failed_count: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
