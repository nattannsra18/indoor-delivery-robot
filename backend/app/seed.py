from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .db_models import DeliveryTaskORM, RobotORM, StationORM
from .models import RobotState, TaskStatus, utc_now

INITIAL_STATIONS = [
    dict(id="A", name="Station A", x=1.2, y=3.4, yaw=0.0, description="Main Office"),
    dict(id="B", name="Station B", x=4.7, y=1.8, yaw=1.57, description="Storage Area"),
    dict(id="C", name="Station C", x=8.5, y=2.1, yaw=1.57, description="Production Line"),
    dict(id="D", name="Station D", x=6.3, y=6.2, yaw=3.14, description="Quality Control"),
]


def seed_database(db: Session) -> None:
    if db.scalar(select(StationORM.id).limit(1)) is None:
        db.add_all([StationORM(**station) for station in INITIAL_STATIONS])

    if db.get(RobotORM, "robot01") is None:
        db.add(
            RobotORM(
                id="robot01",
                name="SCUTTLE-01",
                online=True,
                battery=82,
                state=RobotState.IDLE,
                x=1.2,
                y=3.4,
                yaw=0.0,
                current_task_id=None,
                last_seen="Just now",
            )
        )

    db.flush()

    if db.scalar(select(DeliveryTaskORM.id).limit(1)) is None:
        now = utc_now()
        db.add(
            DeliveryTaskORM(
                id="TASK-001",
                robot_id="robot01",
                pickup_station_id="D",
                destination_station_id="A",
                status=TaskStatus.COMPLETED,
                created_at=now,
                started_at=now,
                completed_at=now,
                progress=100,
            )
        )

    db.commit()


def reset_demo_data(db: Session) -> None:
    db.execute(delete(DeliveryTaskORM))
    db.execute(delete(RobotORM))
    db.execute(delete(StationORM))
    db.commit()
    seed_database(db)
