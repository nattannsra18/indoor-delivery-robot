from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .db_models import DeliveryTaskORM, RobotORM, StationORM, TaskEventORM
from .models import TaskStatus


class DeliveryRepository:
    def __init__(self, db: Session) -> None:
        self.db = db

    # Stations
    def list_stations(self) -> list[StationORM]:
        return list(self.db.scalars(select(StationORM).order_by(StationORM.id)).all())

    def get_station(self, station_id: str) -> StationORM | None:
        return self.db.get(StationORM, station_id)

    def add_station(self, station: StationORM) -> StationORM:
        self.db.add(station)
        self.db.flush()
        return station

    def delete_station(self, station: StationORM) -> None:
        self.db.delete(station)
        self.db.flush()

    def station_is_referenced(self, station_id: str) -> bool:
        stmt = select(func.count()).select_from(DeliveryTaskORM).where(
            (DeliveryTaskORM.pickup_station_id == station_id)
            | (DeliveryTaskORM.destination_station_id == station_id)
        )
        return bool(self.db.scalar(stmt))

    # Robot
    def list_robots(self) -> list[RobotORM]:
        return list(self.db.scalars(select(RobotORM).order_by(RobotORM.id)).all())

    def get_robot(self, robot_id: str = "robot01") -> RobotORM | None:
        return self.db.get(RobotORM, robot_id)

    def get_robot_for_update(self, robot_id: str = "robot01") -> RobotORM | None:
        stmt = select(RobotORM).where(RobotORM.id == robot_id).with_for_update()
        return self.db.scalar(stmt)

    # Tasks
    def list_tasks(
        self, task_status: TaskStatus | None = None, owner_id: str | None = None
    ) -> list[DeliveryTaskORM]:
        stmt = select(DeliveryTaskORM)
        if task_status is not None:
            stmt = stmt.where(DeliveryTaskORM.status == task_status)
        if owner_id is not None:
            stmt = stmt.where(DeliveryTaskORM.owner_id == owner_id)
        stmt = stmt.order_by(DeliveryTaskORM.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_task(self, task_id: str) -> DeliveryTaskORM | None:
        return self.db.get(DeliveryTaskORM, task_id)

    def get_task_for_update(self, task_id: str) -> DeliveryTaskORM | None:
        stmt = select(DeliveryTaskORM).where(DeliveryTaskORM.id == task_id).with_for_update()
        return self.db.scalar(stmt)

    def add_task(self, task: DeliveryTaskORM) -> DeliveryTaskORM:
        self.db.add(task)
        self.db.flush()
        return task

    def active_task(self, active_statuses: set[TaskStatus]) -> DeliveryTaskORM | None:
        stmt = (
            select(DeliveryTaskORM)
            .where(DeliveryTaskORM.status.in_(active_statuses))
            .order_by(DeliveryTaskORM.created_at.asc())
            .limit(1)
        )
        return self.db.scalar(stmt)

    def active_task_for_robot(
        self, robot_id: str, active_statuses: set[TaskStatus]
    ) -> DeliveryTaskORM | None:
        stmt = (
            select(DeliveryTaskORM)
            .where(
                DeliveryTaskORM.robot_id == robot_id,
                DeliveryTaskORM.status.in_(active_statuses),
            )
            .order_by(DeliveryTaskORM.created_at.asc())
            .limit(1)
        )
        return self.db.scalar(stmt)

    def queued_tasks(self) -> list[DeliveryTaskORM]:
        stmt = (
            select(DeliveryTaskORM)
            .where(DeliveryTaskORM.status == TaskStatus.QUEUED)
            .order_by(DeliveryTaskORM.created_at.asc())
        )
        return list(self.db.scalars(stmt).all())

    def next_queued_task_for_update(self) -> DeliveryTaskORM | None:
        stmt = (
            select(DeliveryTaskORM)
            .where(DeliveryTaskORM.status == TaskStatus.QUEUED)
            .order_by(DeliveryTaskORM.created_at.asc())
            .limit(1)
            .with_for_update()
        )
        return self.db.scalar(stmt)

    def count_tasks(self, task_status: TaskStatus, owner_id: str | None = None) -> int:
        stmt = select(func.count()).select_from(DeliveryTaskORM).where(
            DeliveryTaskORM.status == task_status
        )
        if owner_id is not None:
            stmt = stmt.where(DeliveryTaskORM.owner_id == owner_id)
        return int(self.db.scalar(stmt) or 0)

    def next_task_id(self) -> str:
        ids = self.db.scalars(select(DeliveryTaskORM.id)).all()
        max_number = 0
        for task_id in ids:
            if task_id.startswith("TASK-") and task_id[5:].isdigit():
                max_number = max(max_number, int(task_id[5:]))
        return f"TASK-{max_number + 1:03d}"

    def next_station_id(self) -> str:
        ids = self.db.scalars(select(StationORM.id)).all()
        max_number = 0
        for station_id in ids:
            if station_id.startswith("S") and station_id[1:].isdigit():
                max_number = max(max_number, int(station_id[1:]))
        return f"S{max_number + 1}"

    # Task event history
    def add_task_event(self, event: TaskEventORM) -> TaskEventORM:
        self.db.add(event)
        self.db.flush()
        return event

    def list_task_events(self, task_id: str) -> list[TaskEventORM]:
        stmt = (
            select(TaskEventORM)
            .where(TaskEventORM.task_id == task_id)
            .order_by(TaskEventORM.created_at.asc(), TaskEventORM.id.asc())
        )
        return list(self.db.scalars(stmt).all())
