from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base
from .models import RobotState, TaskStatus, utc_now


def enum_column(enum_type, name: str):
    return SAEnum(
        enum_type,
        name=name,
        native_enum=False,
        values_callable=lambda values: [item.value for item in values],
        validate_strings=True,
    )


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
