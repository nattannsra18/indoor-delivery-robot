import asyncio
from datetime import timedelta

import pytest
from fastapi import WebSocketDisconnect
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.config import security_settings
from app.database import Base
from app.db_models import (
    AlertORM,
    DeliveryTaskORM,
    EmergencyStopORM,
    RobotORM,
    SessionORM,
    StationORM,
    TaskEventORM,
    UserORM,
)
from app.models import DeliveryTaskCreate, RobotState, TaskStatus, UserRole, utc_now
from app.navigation_feedback_store import (
    LatestNavigationEstimate,
    NavigationFeedbackStore,
    navigation_feedback_store,
)
from app.queue_estimate_service import (
    NAVIGATION_FEEDBACK_FRESHNESS_SECONDS,
    QueueEstimateService,
)
from app.routers.tasks import list_task_estimates
from app.routers.robot_ws import robot_websocket
from app.seed import seed_database
from app.service import DeliveryService


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Session = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)


def robot_auth_headers() -> dict[str, str]:
    settings = security_settings()
    if settings.robot_ws_auth_required:
        assert settings.robot_ws_token is not None
        return {"authorization": f"Bearer {settings.robot_ws_token}"}
    return {}


@pytest.fixture(autouse=True)
def reset_database():
    navigation_feedback_store.clear()
    with Session() as db:
        for model in (
            TaskEventORM,
            DeliveryTaskORM,
            SessionORM,
            AlertORM,
            EmergencyStopORM,
            UserORM,
            RobotORM,
            StationORM,
        ):
            db.execute(delete(model))
        db.commit()
        seed_database(db)
        db.add_all([
            UserORM(
                id="admin", username="admin",
                password_hash=hash_password("admin-pass", iterations=1000),
                role=UserRole.ADMIN,
            ),
            UserORM(
                id="alice", username="alice",
                password_hash=hash_password("alice-pass", iterations=1000),
                role=UserRole.USER,
            ),
            UserORM(
                id="bob", username="bob",
                password_hash=hash_password("bob-pass", iterations=1000),
                role=UserRole.USER,
            ),
        ])
        db.commit()


def create_global_queue(db):
    service = DeliveryService(db)
    active = service.create_task(
        DeliveryTaskCreate(pickup_station_id="A", destination_station_id="B"),
        owner_id="admin",
    )
    first = service.create_task(
        DeliveryTaskCreate(pickup_station_id="B", destination_station_id="C"),
        owner_id="bob",
    )
    second = service.create_task(
        DeliveryTaskCreate(pickup_station_id="C", destination_station_id="D"),
        owner_id="alice",
    )
    base = utc_now()
    active.created_at = base
    first.created_at = base + timedelta(seconds=1)
    second.created_at = base + timedelta(seconds=2)
    db.commit()
    return active, first, second


class MonotonicClock:
    def __init__(self, now: float = 100.0):
        self.now = now

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def feedback(task_id: str, stage: str = "pickup", eta: float | None = 37.0):
    return LatestNavigationEstimate(
        task_id=task_id,
        stage=stage,
        distance_remaining=3.0,
        estimated_time_remaining_seconds=eta,
    )


class StubRobotWebSocket:
    def __init__(self, messages: list[dict]):
        self.headers = robot_auth_headers()
        self.messages = iter(messages)
        self.sent: list[dict] = []

    async def accept(self) -> None:
        pass

    async def receive_json(self) -> dict:
        try:
            return next(self.messages)
        except StopIteration as error:
            raise WebSocketDisconnect() from error

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)


def test_user_position_uses_global_dispatcher_queue_without_data_leak():
    with Session() as db:
        active, other_owner, owned = create_global_queue(db)
        estimates = QueueEstimateService(db).list_for_owner("alice")
        assert [item.task_id for item in estimates] == [owned.id]
        assert estimates[0].queue_position == 2
        assert estimates[0].queue_position != 3
        assert active.id not in {item.task_id for item in estimates}
        assert other_owner.id not in {item.task_id for item in estimates}


def test_admin_keeps_global_visibility_and_ownerless_does_not_leak():
    with Session() as db:
        _, _, owned = create_global_queue(db)
        legacy = DeliveryService(db).create_task(
            DeliveryTaskCreate(pickup_station_id="D", destination_station_id="A")
        )
        user_ids = {
            item.task_id for item in QueueEstimateService(db).list_for_owner("alice")
        }
        admin_ids = {
            item.task_id for item in QueueEstimateService(db).list_for_owner(None)
        }
        assert user_ids == {owned.id}
        assert legacy.id not in user_ids
        assert legacy.id in admin_ids


def test_estimate_endpoint_scopes_user_to_owned_tasks_only():
    with Session() as db:
        _, other_owner, owned = create_global_queue(db)
        service = DeliveryService(db)
        alice = db.get(UserORM, "alice")
        admin = db.get(UserORM, "admin")
        assert alice is not None
        assert admin is not None

        user_estimates = list_task_estimates(service=service, user=alice)
        admin_estimates = list_task_estimates(service=service, user=admin)

        assert [item.task_id for item in user_estimates] == [owned.id]
        assert other_owner.id not in {item.task_id for item in user_estimates}
        assert other_owner.id in {item.task_id for item in admin_estimates}


@pytest.mark.parametrize("terminal", [
    TaskStatus.COMPLETED,
    TaskStatus.CANCELLED,
    TaskStatus.FAILED,
])
def test_position_updates_when_preceding_task_leaves_queue(terminal):
    with Session() as db:
        _, preceding, owned = create_global_queue(db)
        before = QueueEstimateService(db).list_for_owner("alice")
        assert before[0].queue_position == 2
        preceding.status = terminal
        db.commit()
        after = QueueEstimateService(db).list_for_owner("alice")
        assert after[0].task_id == owned.id
        assert after[0].queue_position == 1


def test_missing_live_eta_is_unavailable_not_zero():
    with Session() as db:
        active, _, _ = create_global_queue(db)
        active.owner_id = "alice"
        db.commit()
        estimate = next(
            item for item in QueueEstimateService(db).list_for_owner("alice")
            if item.task_id == active.id
        )
        assert estimate.status == TaskStatus.GOING_TO_PICKUP
        assert estimate.pickup_eta_seconds is None
        assert estimate.destination_eta_seconds is None
        assert estimate.availability.value == "UNAVAILABLE"


def test_live_nav2_feedback_drives_active_pickup_and_destination_projection():
    with Session() as db:
        active, _, _ = create_global_queue(db)
        active.owner_id = "alice"
        db.commit()
        navigation_feedback_store.set(
            "robot01",
            LatestNavigationEstimate(
                task_id=active.id,
                stage="pickup",
                distance_remaining=3.0,
                estimated_time_remaining_seconds=37.0,
            ),
        )

        estimate = next(
            item for item in QueueEstimateService(db).list_for_owner("alice")
            if item.task_id == active.id
        )

        assert estimate.pickup_eta_seconds == 37.0
        assert estimate.destination_eta_seconds == 70.0
        assert estimate.availability.value == "AVAILABLE"


def test_freshness_uses_server_monotonic_receive_time_not_supplied_value():
    clock = MonotonicClock()
    store = NavigationFeedbackStore(clock)
    store.set(
        "robot01",
        LatestNavigationEstimate(
            task_id="TASK-1",
            stage="pickup",
            distance_remaining=3.0,
            estimated_time_remaining_seconds=37.0,
            # set() must overwrite any caller-provided freshness value.
            received_monotonic=999_999.0,
        ),
    )

    stored = store.get("robot01")
    assert stored is not None
    assert stored.received_monotonic == 100.0
    clock.advance(NAVIGATION_FEEDBACK_FRESHNESS_SECONDS)
    assert store.get_matching_fresh(
        "robot01", "TASK-1", "pickup", NAVIGATION_FEEDBACK_FRESHNESS_SECONDS
    ) is not None
    clock.advance(0.01)
    assert store.get_matching_fresh(
        "robot01", "TASK-1", "pickup", NAVIGATION_FEEDBACK_FRESHNESS_SECONDS
    ) is None


def test_live_estimate_rejects_stale_wrong_or_invalid_feedback_without_zero():
    clock = MonotonicClock()
    store = NavigationFeedbackStore(clock)
    with Session() as db:
        active, _, _ = create_global_queue(db)
        active.owner_id = "alice"
        db.commit()
        store.set("robot01", feedback(active.id))
        service = QueueEstimateService(db, feedback_store=store)

        fresh = next(item for item in service.list_for_owner("alice") if item.task_id == active.id)
        assert fresh.pickup_eta_seconds == 37.0

        assert store.get_matching_fresh(
            "robot01", "other-task", "pickup", NAVIGATION_FEEDBACK_FRESHNESS_SECONDS
        ) is None
        assert store.get_matching_fresh(
            "robot01", active.id, "destination", NAVIGATION_FEEDBACK_FRESHNESS_SECONDS
        ) is None

        clock.advance(NAVIGATION_FEEDBACK_FRESHNESS_SECONDS + 0.01)
        stale = next(item for item in service.list_for_owner("alice") if item.task_id == active.id)
        assert stale.pickup_eta_seconds is None
        assert stale.destination_eta_seconds is None
        assert stale.availability.value == "UNAVAILABLE"

        for invalid_eta in (None, -1.0, float("nan")):
            store.set("robot01", feedback(active.id, eta=invalid_eta))
            invalid = next(item for item in service.list_for_owner("alice") if item.task_id == active.id)
            assert invalid.pickup_eta_seconds is None
            assert invalid.destination_eta_seconds is None


def test_conditional_clear_preserves_newer_feedback_for_another_task():
    clock = MonotonicClock()
    store = NavigationFeedbackStore(clock)
    store.set("robot01", feedback("TASK-OLD"))
    store.set("robot01", feedback("TASK-NEW", "destination"))

    assert not store.clear_matching("robot01", "TASK-OLD", "pickup")
    newer = store.get("robot01")
    assert newer is not None
    assert newer.task_id == "TASK-NEW"
    assert newer.stage == "destination"
    assert store.clear_matching("robot01", "TASK-NEW", "destination")
    assert store.get("robot01") is None


def test_result_cancellation_and_disconnect_cleanup_are_identity_safe():
    clock = MonotonicClock()
    store = NavigationFeedbackStore(clock)
    store.set("robot01", feedback("TASK-RESULT", "pickup"))

    # An accepted navigation result clears its exact task/stage feedback.
    assert store.clear_matching("robot01", "TASK-RESULT", "pickup")
    assert store.get("robot01") is None

    store.set("robot01", feedback("TASK-CANCEL", "destination"))
    # An accepted cancellation clears either navigation stage for that task.
    assert store.clear_matching("robot01", "TASK-CANCEL")
    assert store.get("robot01") is None

    store.set("robot01", feedback("TASK-DISCONNECT"))
    assert store.clear_robot("robot01")
    assert store.get("robot01") is None


def test_accepted_navigation_result_clears_matching_feedback(monkeypatch):
    calls: list[tuple[str, str, str | None]] = []
    original_clear = navigation_feedback_store.clear_matching

    def capture_clear(robot_id: str, task_id: str, stage: str | None = None):
        calls.append((robot_id, task_id, stage))
        return original_clear(robot_id, task_id, stage)

    monkeypatch.setattr(navigation_feedback_store, "clear_matching", capture_clear)
    with Session() as db:
        task, _, _ = create_global_queue(db)
        command = DeliveryService(db).build_navigation_command(task)
        assert command is not None
        navigation_feedback_store.set("robot01", feedback(task.id, "pickup"))
        websocket = StubRobotWebSocket([
            {
                "type": "navigation_result",
                "command_id": command["command_id"],
                "task_id": task.id,
                "stage": "pickup",
                "status": "succeeded",
            }
        ])
        asyncio.run(robot_websocket(websocket, "robot01", db))

    assert ("robot01", task.id, "pickup") in calls


def test_accepted_navigation_cancellation_clears_matching_feedback(monkeypatch):
    calls: list[tuple[str, str, str | None]] = []
    original_clear = navigation_feedback_store.clear_matching

    def capture_clear(robot_id: str, task_id: str, stage: str | None = None):
        calls.append((robot_id, task_id, stage))
        return original_clear(robot_id, task_id, stage)

    monkeypatch.setattr(navigation_feedback_store, "clear_matching", capture_clear)
    with Session() as db:
        task, _, _ = create_global_queue(db)
        DeliveryService(db).cancel_task(task.id)
        navigation_feedback_store.set("robot01", feedback(task.id, "pickup"))
        websocket = StubRobotWebSocket([
            {
                "type": "navigation_cancelled",
                "cancel_id": f"{task.id}:cancel:accepted",
                "task_id": task.id,
                "cancelled": True,
            }
        ])
        asyncio.run(robot_websocket(websocket, "robot01", db))

    assert ("robot01", task.id, None) in calls


def test_retry_and_demo_reset_clear_transient_feedback():
    with Session() as db:
        active, _, _ = create_global_queue(db)
        active.status = TaskStatus.FAILED
        db.commit()
        navigation_feedback_store.set("robot01", feedback(active.id))

        DeliveryService(db).retry_task(active.id)
        assert navigation_feedback_store.get("robot01") is None

        navigation_feedback_store.set("robot01", feedback("TASK-OTHER"))
        DeliveryService(db).reset_demo()
        assert navigation_feedback_store.get("robot01") is None
