from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import AlertSeverity, EmergencyStopState, RobotState, TaskStatus, UserRole, utc_now


def enum_column(enum_type, name: str):
    return SAEnum(
        enum_type,
        name=name,
        native_enum=False,
        values_callable=lambda values: [item.value for item in values],
        validate_strings=True,
    )


class UserORM(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    username: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(500), nullable=False)
    role: Mapped[UserRole] = mapped_column(enum_column(UserRole, "user_role"), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False)


class SessionORM(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

class StationORM(Base):
    __tablename__ = "stations"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    x: Mapped[float] = mapped_column(Float, nullable=False)
    y: Mapped[float] = mapped_column(Float, nullable=False)
    yaw: Mapped[float] = mapped_column(Float, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)


class RobotORM(Base):
    __tablename__ = "robots"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    online: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    battery: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    state: Mapped[RobotState] = mapped_column(
        enum_column(RobotState, "robot_state"),
        nullable=False,
        default=RobotState.IDLE,
    )
    x: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    y: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    yaw: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    current_task_id: Mapped[str | None] = mapped_column(String(40), nullable=True)
    last_seen: Mapped[str] = mapped_column(String(100), nullable=False, default="Just now")


class DeliveryTaskORM(Base):
    __tablename__ = "delivery_tasks"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    robot_id: Mapped[str | None] = mapped_column(
        ForeignKey("robots.id", ondelete="SET NULL"),
        nullable=True,
    )
    pickup_station_id: Mapped[str] = mapped_column(
        ForeignKey("stations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    destination_station_id: Mapped[str] = mapped_column(
        ForeignKey("stations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[TaskStatus] = mapped_column(
        enum_column(TaskStatus, "task_status"),
        nullable=False,
        default=TaskStatus.QUEUED,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=utc_now,
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    owner_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class TaskEventORM(Base):
    __tablename__ = "task_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    task_id: Mapped[str] = mapped_column(
        ForeignKey("delivery_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    event_type: Mapped[str] = mapped_column(String(80), nullable=False)
    from_status: Mapped[TaskStatus | None] = mapped_column(
        enum_column(TaskStatus, "task_event_from_status"), nullable=True
    )
    to_status: Mapped[TaskStatus] = mapped_column(
        enum_column(TaskStatus, "task_event_to_status"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(40), nullable=False, default="SYSTEM")
    detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utc_now, index=True
    )


class AlertORM(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    deduplication_key: Mapped[str] = mapped_column(String(300), unique=True, index=True, nullable=False)
    robot_id: Mapped[str | None] = mapped_column(ForeignKey("robots.id", ondelete="SET NULL"), nullable=True)
    severity: Mapped[AlertSeverity] = mapped_column(enum_column(AlertSeverity, "alert_severity"), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(80), nullable=False)
    first_occurrence_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    latest_occurrence_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now)
    occurrence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    acknowledged: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    acknowledged_by_user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmergencyStopORM(Base):
    __tablename__ = "emergency_stops"

    robot_id: Mapped[str] = mapped_column(ForeignKey("robots.id", ondelete="CASCADE"), primary_key=True)
    state: Mapped[EmergencyStopState] = mapped_column(enum_column(EmergencyStopState, "emergency_stop_state"), nullable=False, default=EmergencyStopState.NORMAL)
    latched: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, index=True)
    pending_command_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    command_deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_detail: Mapped[str | None] = mapped_column(Text, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utc_now, onupdate=utc_now)
