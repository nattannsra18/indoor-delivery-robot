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
    username: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=1, max_length=1024)


class Station(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    x: float
    y: float
    yaw: float
    description: Optional[str] = None


class StationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    x: float
    y: float
    yaw: float
    description: Optional[str] = Field(default=None, max_length=200)


class Robot(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    online: bool
    battery: int = Field(ge=0, le=100)
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


class TaskEstimate(BaseModel):
    task_id: str
    status: TaskStatus
    queue_position: Optional[int] = Field(default=None, ge=1)
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


class DeliveryTaskCreate(BaseModel):
    pickup_station_id: str
    destination_station_id: str

    @model_validator(mode="after")
    def validate_stations(self):
        if self.pickup_station_id == self.destination_station_id:
            raise ValueError("pickup_station_id and destination_station_id must be different")
        return self


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
    robot: Robot
    active_task: Optional[DeliveryTask]
    queued_count: int
    completed_count: int
    failed_count: int


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
