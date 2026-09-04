import asyncio
from pathlib import Path

import pytest
from fastapi import BackgroundTasks, WebSocketDisconnect
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker

from app.browser_websocket_manager import browser_connection_manager
from app.command_dispatch import schedule_navigation_path_clear
from app.config import security_settings
from app.database import Base
from app.db_models import (
    DeliveryTaskORM,
    RobotORM,
    StationORM,
    TaskEventORM,
    SessionORM,
    UserORM,
)
from app.models import DeliveryTaskCreate, NavigationPathMessage, UserRole
from app.auth import create_session, hash_password, SESSION_COOKIE_NAME
from app.navigation_path_store import navigation_path_store
from app.routers.dashboard_ws import dashboard_websocket
from app.routers.robot_ws import robot_websocket
from app.seed import seed_database
from app.service import DeliveryService


TEST_DB = Path(__file__).resolve().parent / "navigation_path_test.db"
if TEST_DB.exists():
    TEST_DB.unlink()

engine = create_engine(
    f"sqlite:///{TEST_DB.as_posix()}",
    connect_args={"check_same_thread": False},
)
Session = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(bind=engine)


def robot_auth_headers() -> dict[str, str]:
    settings = security_settings()
    if settings.robot_ws_auth_required:
        assert settings.robot_ws_token is not None
        return {"authorization": f"Bearer {settings.robot_ws_token}"}
    return {}


class StubWebSocket:
    def __init__(self, messages: list[dict]):
        self.messages = iter(messages)
        self.sent: list[dict] = []
        self.accepted = False
        self.headers = robot_auth_headers()
        self.cookies = {}

    async def accept(self) -> None:
        self.accepted = True

    async def receive_json(self) -> dict:
        try:
            return next(self.messages)
        except StopIteration as error:
            raise WebSocketDisconnect() from error

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)

    async def close(self, code: int = 1000, reason: str = "") -> None:
        pass


@pytest.fixture(autouse=True)
def reset_state():
    navigation_path_store.clear_all()
    with Session() as db:
        db.execute(delete(TaskEventORM))
        db.execute(delete(SessionORM))
        db.execute(delete(DeliveryTaskORM))
        db.execute(delete(RobotORM))
        db.execute(delete(StationORM))
        db.commit()
        seed_database(db)
        if db.get(UserORM, "admin-id") is None:
            db.add(UserORM(id="admin-id", username="admin", password_hash=hash_password("pw", iterations=1000), role=UserRole.ADMIN))
            db.commit()
    yield
    navigation_path_store.clear_all()


def active_command(db):
    service = DeliveryService(db)
    task = service.create_task(
        DeliveryTaskCreate(
            pickup_station_id="A",
            destination_station_id="C",
        )
    )
    command = service.build_navigation_command(task)
    assert command is not None
    return task, command


def path_message(command, poses=None):
    return {
        "type": "navigation_path",
        "command_id": command["command_id"],
        "task_id": command["task_id"],
        "stage": command["stage"],
        "frame_id": "map",
        "timestamp": "2026-09-03T10:00:00+00:00",
        "poses": poses or [
            {"x": -2.0, "y": -0.5, "yaw": 0.0},
            {"x": -1.5, "y": 0.0},
        ],
    }


def run_robot(messages, monkeypatch):
    events: list[dict] = []

    async def capture(message: dict, **_kwargs) -> None:
        events.append(message)

    monkeypatch.setattr(
        browser_connection_manager,
        "broadcast_json",
        capture,
    )
    websocket = StubWebSocket(messages)
    with Session() as db:
        asyncio.run(robot_websocket(websocket, "robot01", db))
    return websocket, events


def test_valid_robot_path_is_stored_broadcast_and_cleared_on_disconnect(
    monkeypatch,
):
    with Session() as db:
        _, command = active_command(db)

    websocket, events = run_robot(
        [path_message(command)],
        monkeypatch,
    )

    paths = [event for event in events if event["type"] == "navigation_path"]
    clears = [
        event for event in events
        if event["type"] == "navigation_path_clear"
    ]
    assert websocket.sent[0]["type"] == "connection_ack"
    assert len(paths) == 1
    assert paths[0]["robot_id"] == "robot01"
    assert paths[0]["poses"][0] == {
        "x": -2.0,
        "y": -0.5,
        "yaw": 0.0,
    }
    assert clears[-1]["reason"] == "robot_disconnect"
    assert navigation_path_store.get("robot01") is None


@pytest.mark.parametrize(
    "poses",
    [
        [{"x": float("nan"), "y": 0.0}],
        [{"x": 0.0, "y": float("inf")}],
        [{"x": 0.0, "y": 0.0, "yaw": float("-inf")}],
    ],
)
def test_non_finite_path_coordinates_are_rejected(monkeypatch, poses):
    with Session() as db:
        _, command = active_command(db)
    websocket, events = run_robot(
        [path_message(command, poses)],
        monkeypatch,
    )
    assert websocket.sent[2]["code"] == "INVALID_NAVIGATION_PATH"
    assert not any(event["type"] == "navigation_path" for event in events)


def test_malformed_and_excessive_paths_are_rejected(monkeypatch):
    with Session() as db:
        _, command = active_command(db)
    excessive = [{"x": float(index), "y": 0.0} for index in range(501)]
    websocket, events = run_robot(
        [
            {"type": "navigation_path", "poses": []},
            path_message(command, excessive),
        ],
        monkeypatch,
    )
    errors = [item for item in websocket.sent if item["type"] == "error"]
    assert [item["code"] for item in errors] == [
        "INVALID_NAVIGATION_PATH",
        "INVALID_NAVIGATION_PATH",
    ]
    assert not any(event["type"] == "navigation_path" for event in events)


@pytest.mark.parametrize(
    ("field", "value", "error_code"),
    [
        ("task_id", "Task-999", "PATH_TASK_MISMATCH"),
        ("command_id", "Task-001:pickup:wrong", "PATH_COMMAND_MISMATCH"),
        ("stage", "destination", "PATH_STAGE_MISMATCH"),
    ],
)
def test_path_must_match_active_workflow(
    monkeypatch,
    field,
    value,
    error_code,
):
    with Session() as db:
        _, command = active_command(db)
    message = path_message(command)
    message[field] = value
    websocket, events = run_robot([message], monkeypatch)
    errors = [item for item in websocket.sent if item["type"] == "error"]
    assert errors[0]["code"] == error_code
    assert not any(event["type"] == "navigation_path" for event in events)


def test_navigation_result_clears_stored_path(monkeypatch):
    with Session() as db:
        _, command = active_command(db)
    result = {
        "type": "navigation_result",
        "command_id": command["command_id"],
        "task_id": command["task_id"],
        "stage": command["stage"],
        "status": "succeeded",
        "detail": "arrived",
    }
    _, events = run_robot([path_message(command), result], monkeypatch)
    workflow_events = [
        event for event in events
        if event["type"] == "workflow_updated"
    ]
    assert len(workflow_events) == 1
    assert workflow_events[0]["reason"] == "navigation_result"
    assert workflow_events[0]["task_id"] == command["task_id"]
    assert workflow_events[0]["robot_id"] == "robot01"
    assert workflow_events[0]["stage"] == "pickup"
    assert workflow_events[0]["navigation_status"] == "succeeded"
    assert workflow_events[0]["task_status"] == "WAITING_FOR_LOADING"
    assert any(
        event["type"] == "navigation_path_clear"
        and event["reason"] == "navigation_result"
        for event in events
    )
    assert navigation_path_store.get("robot01") is None
    assert navigation_path_store.active_command("robot01") is None


def test_cancellation_request_clears_path(monkeypatch):
    with Session() as db:
        task, command = active_command(db)
        assert navigation_path_store.update(
            "robot01",
            NavigationPathMessage.model_validate(path_message(command)),
        )
        DeliveryService(db).cancel_task(task.id)

    background = BackgroundTasks()
    schedule_navigation_path_clear(
        background,
        "robot01",
        "cancellation_requested",
        remove_command=False,
    )
    assert navigation_path_store.get("robot01") is None


def test_command_change_clears_stored_path():
    with Session() as db:
        task, command = active_command(db)
        assert navigation_path_store.update(
            "robot01",
            NavigationPathMessage.model_validate(path_message(command)),
        )
        changed = navigation_path_store.command_for(
            "robot01",
            task.id,
            "destination",
        )

    assert changed.command_id != command["command_id"]
    assert navigation_path_store.get("robot01") is None


def test_browser_cannot_inject_navigation_path():
    websocket = StubWebSocket([
        {
            "type": "navigation_path",
            "command_id": "fake",
            "task_id": "Task-001",
            "stage": "pickup",
            "frame_id": "map",
            "timestamp": "2026-09-03T10:00:00+00:00",
            "poses": [{"x": 0.0, "y": 0.0}],
        }
    ])
    with Session() as db:
        user = db.get(UserORM, "admin-id")
        token, _ = create_session(db, user)
        websocket.cookies[SESSION_COOKIE_NAME] = token
        asyncio.run(dashboard_websocket(websocket, db))
    assert [message["type"] for message in websocket.sent] == [
        "dashboard_connection_ack",
        "notification_snapshot",
        "alert_snapshot",
        "emergency_stop_snapshot",
        "error",
    ]
    assert websocket.sent[-1]["code"] == "UNSUPPORTED_MESSAGE"
    assert navigation_path_store.get("robot01") is None
