from datetime import timedelta

import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine, delete, inspect, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.database import Base
from app.db_models import (
    DeliveryTaskORM,
    RobotORM,
    StationORM,
    TaskEventORM,
    UserORM,
)
from app.models import (
    DeliveryTaskCreate,
    EventSource,
    RobotState,
    TaskEvent,
    TaskPriority,
    TaskStatus,
    UserRole,
    OccupancyGridPayload,
    utc_now,
)
from app.queue_estimate_service import QueueEstimateService
from app.routers.tasks import create_task as create_task_endpoint
from app.routers.tasks import list_tasks as list_visible_tasks
from app.schema import apply_compatibility_migrations
from app.seed import seed_database
from app.service import DeliveryService
from app.map_store import map_store
from app.route_preview import route_preview_coordinator


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Session = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def reset_database():
    route_preview_coordinator.clear()
    map_store.clear()
    with Session() as db:
        for model in (
            TaskEventORM,
            DeliveryTaskORM,
            UserORM,
            RobotORM,
            StationORM,
        ):
            db.execute(delete(model))
        db.commit()
        seed_database(db)
        db.add_all([
            UserORM(
                id="admin",
                username="admin",
                password_hash=hash_password("admin-pass", iterations=1000),
                role=UserRole.ADMIN,
            ),
            UserORM(
                id="alice",
                username="alice",
                password_hash=hash_password("alice-pass", iterations=1000),
                role=UserRole.USER,
            ),
            UserORM(
                id="bob",
                username="bob",
                password_hash=hash_password("bob-pass", iterations=1000),
                role=UserRole.USER,
            ),
        ])
        db.commit()
    map_store.update(OccupancyGridPayload(
        frame_id="map", resolution=1.0, width=1, height=1,
        origin_x=0.0, origin_y=0.0, origin_yaw=0.0, data=[0],
    ))
    yield
    route_preview_coordinator.clear()
    map_store.clear()


def payload(
    pickup="A",
    destination="B",
    *,
    priority=TaskPriority.NORMAL,
    recipient_name=None,
    delivery_note=None,
):
    return DeliveryTaskCreate(
        pickup_station_id=pickup,
        destination_station_id=destination,
        priority=priority,
        recipient_name=recipient_name,
        delivery_note=delivery_note,
    )


def test_create_schema_defaults_normal_and_normalizes_optional_text():
    request = payload(recipient_name="  Ada Lovelace  ", delivery_note="  Lab 2  ")
    assert request.priority == TaskPriority.NORMAL
    assert request.recipient_name == "Ada Lovelace"
    assert request.delivery_note == "Lab 2"
    assert payload(recipient_name="   ", delivery_note="\n").recipient_name is None
    assert payload(recipient_name="   ", delivery_note="\n").delivery_note is None


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("recipient_name", "x" * 101),
        ("delivery_note", "x" * 501),
    ],
)
def test_create_schema_rejects_overlong_metadata(field, value):
    with pytest.raises(ValidationError):
        payload(**{field: value})


def test_compatibility_migration_preserves_rows_and_backfills_normal():
    legacy_engine = create_engine("sqlite://")
    with legacy_engine.begin() as connection:
        connection.execute(text(
            "CREATE TABLE delivery_tasks ("
            "id VARCHAR(40) PRIMARY KEY, owner_id VARCHAR(40), "
            "pickup_station_id VARCHAR(20), destination_station_id VARCHAR(20), "
            "status VARCHAR(30), created_at DATETIME, progress INTEGER)"
        ))
        connection.execute(text(
            "INSERT INTO delivery_tasks "
            "(id, pickup_station_id, destination_station_id, status, created_at, progress) "
            "VALUES ('TASK-OLD', 'A', 'B', 'QUEUED', CURRENT_TIMESTAMP, 0)"
        ))

    apply_compatibility_migrations(legacy_engine)
    apply_compatibility_migrations(legacy_engine)

    columns = {column["name"] for column in inspect(legacy_engine).get_columns("delivery_tasks")}
    assert {"priority", "recipient_name", "delivery_note"} <= columns
    with legacy_engine.connect() as connection:
        row = connection.execute(text(
            "SELECT id, priority, recipient_name, delivery_note FROM delivery_tasks"
        )).one()
    assert row == ("TASK-OLD", "NORMAL", None, None)


def test_user_cannot_create_high_but_admin_can_and_metadata_round_trips():
    with Session() as db:
        service = DeliveryService(db)
        alice = db.get(UserORM, "alice")
        admin = db.get(UserORM, "admin")
        request = payload(
            priority=TaskPriority.HIGH,
            recipient_name="Grace Hopper",
            delivery_note="Leave with the lab supervisor.",
        )

        with pytest.raises(HTTPException) as denied:
            create_task_endpoint(request, BackgroundTasks(), service, alice)
        assert denied.value.status_code == 403
        assert service.list_tasks(owner_id="alice") == []

        snapshot = map_store.get()
        assert snapshot is not None
        request.preview_id = route_preview_coordinator.issue_validation(
            owner_id="admin",
            robot_id="robot01",
            pickup_station_id="A",
            destination_station_id="B",
            priority=TaskPriority.HIGH,
            map_revision=snapshot.revision,
        )
        created = create_task_endpoint(request, BackgroundTasks(), service, admin)
        assert created.priority == TaskPriority.HIGH
        assert created.recipient_name == "Grace Hopper"
        assert created.delivery_note == "Leave with the lab supervisor."
        assert created.owner_id == "admin"


def test_priority_queue_is_canonical_for_dispatcher_and_eta_without_preemption():
    with Session() as db:
        service = DeliveryService(db)
        active = service.create_task(payload(), owner_id="alice")
        normal = service.create_task(payload("B", "C"), owner_id="bob")
        high = service.create_task(
            payload("C", "D", priority=TaskPriority.HIGH),
            owner_id="alice",
        )

        assert active.status == TaskStatus.GOING_TO_PICKUP
        assert normal.status == high.status == TaskStatus.QUEUED
        assert service.active_task().id == active.id
        assert [task.id for task in service.repo.queued_tasks()] == [high.id, normal.id]

        alice_estimate = QueueEstimateService(db).list_for_owner("alice")
        high_estimate = next(item for item in alice_estimate if item.task_id == high.id)
        assert high_estimate.queue_position == 1
        assert normal.id not in {item.task_id for item in alice_estimate}

        robot = db.get(RobotORM, "robot01")
        active.status = TaskStatus.COMPLETED
        active.completed_at = utc_now()
        robot.state = RobotState.IDLE
        robot.current_task_id = None
        db.flush()
        dispatched = service.dispatch_next_queued_task(robot=robot)
        assert dispatched.id == high.id
        assert high.status == TaskStatus.GOING_TO_PICKUP
        assert normal.status == TaskStatus.QUEUED


def test_same_priority_uses_created_at_then_id_as_deterministic_tie_breaker():
    with Session() as db:
        service = DeliveryService(db)
        service.create_task(payload(), owner_id="admin")
        first = service.create_task(payload("B", "C", priority=TaskPriority.HIGH))
        second = service.create_task(payload("C", "D", priority=TaskPriority.HIGH))
        tied = utc_now() + timedelta(seconds=1)
        first.created_at = tied
        second.created_at = tied
        db.commit()
        assert [task.id for task in service.repo.queued_tasks()] == sorted([first.id, second.id])


def test_retry_preserves_priority_recipient_and_note():
    with Session() as db:
        service = DeliveryService(db)
        task = service.create_task(payload(
            priority=TaskPriority.HIGH,
            recipient_name="Katherine Johnson",
            delivery_note="Fragile payload",
        ))
        service.apply_task_event(
            task.id,
            TaskEvent.NAVIGATION_FAILED,
            source=EventSource.ROBOT_AGENT,
        )

        retried = service.retry_task(task.id)
        assert retried.priority == TaskPriority.HIGH
        assert retried.recipient_name == "Katherine Johnson"
        assert retried.delivery_note == "Fragile payload"


def test_metadata_visibility_follows_existing_task_ownership_filter():
    with Session() as db:
        service = DeliveryService(db)
        robot = db.get(RobotORM, "robot01")
        robot.online = False
        robot.state = RobotState.OFFLINE
        db.commit()
        alice_task = service.create_task(payload(
            recipient_name="Alice recipient",
            delivery_note="Alice private note",
        ), owner_id="alice")
        bob_task = service.create_task(payload(
            recipient_name="Bob recipient",
            delivery_note="Bob private note",
        ), owner_id="bob")
        alice = db.get(UserORM, "alice")
        admin = db.get(UserORM, "admin")

        user_tasks = list_visible_tasks(None, service, alice)
        admin_tasks = list_visible_tasks(None, service, admin)
        assert [task.id for task in user_tasks] == [alice_task.id]
        assert bob_task.id not in {task.id for task in user_tasks}
        assert {alice_task.id, bob_task.id} <= {task.id for task in admin_tasks}
