from __future__ import annotations

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .db_models import DeliveryTaskORM, RobotORM, StationORM, TaskEventORM, UserORM
from .models import TaskPriority, TaskStatus


def queued_task_ordering():
    """Canonical dispatcher/ETA order for tasks that are still queued."""
    return (
        case(
            (DeliveryTaskORM.priority == TaskPriority.HIGH, 0),
            else_=1,
        ),
        DeliveryTaskORM.created_at.asc(),
        DeliveryTaskORM.id.asc(),
    )


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

    def list_tasks_page(
        self,
        task_status: TaskStatus | None,
        owner_id: str | None,
        query: str | None,
        offset: int,
        limit: int,
    ) -> tuple[list[DeliveryTaskORM], int]:
        filters = []
        if task_status is not None:
            filters.append(DeliveryTaskORM.status == task_status)
        if owner_id is not None:
            filters.append(DeliveryTaskORM.owner_id == owner_id)
        normalized = (query or "").strip()
        search_filter = None
        if normalized:
            pattern = f"%{normalized}%"
            search_filter = (
                DeliveryTaskORM.id.ilike(pattern)
                | DeliveryTaskORM.pickup_station_id.ilike(pattern)
                | DeliveryTaskORM.destination_station_id.ilike(pattern)
                | UserORM.username.ilike(pattern)
            )

        item_statement = select(DeliveryTaskORM).outerjoin(
            UserORM, DeliveryTaskORM.owner_id == UserORM.id
        )
        count_statement = select(func.count()).select_from(DeliveryTaskORM).outerjoin(
            UserORM, DeliveryTaskORM.owner_id == UserORM.id
        )
        if filters:
            item_statement = item_statement.where(*filters)
            count_statement = count_statement.where(*filters)
        if search_filter is not None:
            item_statement = item_statement.where(search_filter)
            count_statement = count_statement.where(search_filter)
        items = list(self.db.scalars(
            item_statement.order_by(DeliveryTaskORM.created_at.desc(), DeliveryTaskORM.id.desc())
            .offset(offset).limit(limit)
        ).all())
        return items, int(self.db.scalar(count_statement) or 0)

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
            .order_by(DeliveryTaskORM.created_at.asc(), DeliveryTaskORM.id.asc())
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
            .order_by(DeliveryTaskORM.created_at.asc(), DeliveryTaskORM.id.asc())
            .limit(1)
        )
        return self.db.scalar(stmt)

    def queued_tasks(self) -> list[DeliveryTaskORM]:
        stmt = (
            select(DeliveryTaskORM)
            .where(DeliveryTaskORM.status == TaskStatus.QUEUED)
            .order_by(*queued_task_ordering())
        )
        return list(self.db.scalars(stmt).all())

    def next_queued_task_for_update(self) -> DeliveryTaskORM | None:
        stmt = (
            select(DeliveryTaskORM)
            .where(DeliveryTaskORM.status == TaskStatus.QUEUED)
            .order_by(*queued_task_ordering())
            .limit(1)
            # Lock only the delivery task row. This remains valid if a loader
            # option adds another table to the SELECT in the future.
            .with_for_update(of=DeliveryTaskORM)
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
