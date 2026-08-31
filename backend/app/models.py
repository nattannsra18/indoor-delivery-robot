from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TaskStatus(str, Enum):
    QUEUED = "QUEUED"
    GOING_TO_PICKUP = "GOING_TO_PICKUP"
    WAITING_FOR_LOADING = "WAITING_FOR_LOADING"
    DELIVERING = "DELIVERING"
    WAITING_FOR_UNLOADING = "WAITING_FOR_UNLOADING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


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
    WEB_SIMULATOR = "WEB_SIMULATOR"
    ROBOT_AGENT = "ROBOT_AGENT"
    SYSTEM = "SYSTEM"


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
    source: EventSource = EventSource.WEB_SIMULATOR
    detail: Optional[str] = Field(default=None, max_length=500)


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
