import asyncio
import os
from pathlib import Path
from typing import Callable

TEST_DB = Path(__file__).resolve().parent / "phase4_test.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.db_models import (
    AlertORM,
    AuditRecordORM,
    DeliveryTaskORM,
    EmergencyStopORM,
    RobotORM,
    NotificationORM,
    SessionORM,
    StationORM,
    TaskEventORM,
    UserORM,
)
from app.auth import hash_password
from app.config import security_settings
from app.models import OccupancyGridPayload, TaskPriority, UserRole
from app.main import app
from app.routers.robot_ws import robot_websocket
from app.seed import seed_database
from app.map_store import map_store
from app.navigation_feedback_store import (
    navigation_feedback_store,
)
from app.navigation_path_store import navigation_path_store
from app.route_preview import route_preview_coordinator
from app.browser_websocket_manager import (
    browser_connection_manager,
)

if TEST_DB.exists():
    TEST_DB.unlink()

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(
    bind=test_engine,
    autoflush=True,
    expire_on_commit=False,
)

Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def robot_auth_headers() -> dict[str, str]:
    settings = security_settings()
    if settings.robot_ws_auth_required:
        assert settings.robot_ws_token is not None
        return {
            "authorization": (
                f"Bearer {settings.robot_ws_token}"
            )
        }
    return {}


def robot_websocket_connect():
    return client.websocket_connect(
        "/ws/robots/robot01",
        headers=robot_auth_headers(),
    )


def receive_message_of_type(
    websocket,
    expected_type: str,
    *,
    max_messages: int,
    skippable_types: set[str] | None = None,
    skipped_message_validators: dict[str, Callable[[dict], None]] | None = None,
) -> dict:
    """Receive a bounded sequence, allowing only known queued messages."""
    skipped = skippable_types or set()
    validators = skipped_message_validators or {}
    received_types: list[str | None] = []

    for _ in range(max_messages):
        message = websocket.receive_json()
        message_type = message.get("type")
        received_types.append(message_type)
        if message_type == expected_type:
            return message
        if message_type not in skipped:
            raise AssertionError(
                f"Expected {expected_type!r}, received "
                f"unexpected {message_type!r} after "
                f"{received_types!r}"
            )
        validator = validators.get(message_type)
        if validator is not None:
            validator(message)

    raise AssertionError(
        f"Did not receive {expected_type!r} within "
        f"{max_messages} messages; received {received_types!r}"
    )


def notification_identity(message: dict) -> dict[str, str | None]:
    """Return only stable, non-content notification fields for assertions."""
    notification = message.get("notification")
    assert isinstance(notification, dict)
    return {
        "id": notification.get("id"),
        "event_type": notification.get("event_type"),
        "entity_type": notification.get("entity_type"),
        "entity_id": notification.get("entity_id"),
    }


class StubWebSocket:
    def __init__(self, messages: list[dict]):
        self.messages = iter(messages)
        self.sent: list[dict] = []
        self.accepted = False
        self.headers = robot_auth_headers()

    async def accept(self) -> None:
        self.accepted = True

    async def receive_json(self) -> dict:
        try:
            return next(self.messages)
        except StopIteration as error:
            raise WebSocketDisconnect() from error

    async def send_json(self, message: dict) -> None:
        self.sent.append(message)


def setup_function():
    browser_connection_manager.clear()
    route_preview_coordinator.clear()
    navigation_path_store.clear_all()
    navigation_feedback_store.clear()
    map_store.clear()
    with TestingSessionLocal() as db:
        db.execute(delete(SessionORM))
        db.execute(delete(AuditRecordORM))
        db.execute(delete(NotificationORM))
        db.execute(delete(TaskEventORM))
        db.execute(delete(DeliveryTaskORM))
        db.execute(delete(EmergencyStopORM))
        db.execute(delete(AlertORM))
        db.execute(delete(RobotORM))
        db.execute(delete(StationORM))
        db.commit()
        seed_database(db)
        user = db.query(UserORM).filter_by(username="test-admin").one_or_none()
        if user is None:
            db.add(UserORM(id="test-admin-id", username="test-admin", password_hash=hash_password("test-password", iterations=1000), role=UserRole.ADMIN))
            db.commit()
    response = client.post("/api/auth/login", json={"username": "test-admin", "password": "test-password"})
    assert response.status_code == 200
    map_store.update(OccupancyGridPayload(
        frame_id="map", resolution=1.0, width=1, height=1,
        origin_x=0.0, origin_y=0.0, origin_yaw=0.0, data=[0],
    ))


def create_task(pickup="A", destination="C"):
    snapshot = map_store.get()
    assert snapshot is not None
    preview_id = route_preview_coordinator.issue_validation(
        owner_id="test-admin-id",
        robot_id="robot01",
        pickup_station_id=pickup,
        destination_station_id=destination,
        priority=TaskPriority.NORMAL,
        map_revision=snapshot.revision,
    )
    response = client.post(
        "/api/tasks",
        json={
            "pickup_station_id": pickup,
            "destination_station_id": destination,
            "preview_id": preview_id,
        },
    )
    assert response.status_code == 201
    return response.json()


def report_navigation_result(
    task_id: str,
    stage: str,
    navigation_status: str = "succeeded",
):
    with robot_websocket_connect() as websocket:
        connection = websocket.receive_json()

        assert connection["type"] == "connection_ack"

        command = websocket.receive_json()

        assert command["type"] == "command"
        assert command["task_id"] == task_id
        assert command["stage"] == stage

        websocket.send_json(
            {
                "type": "navigation_result",
                "command_id": command["command_id"],
                "task_id": task_id,
                "stage": stage,
                "status": navigation_status,
                "detail": (
                    "Navigation completed by test Robot Agent"
                    if navigation_status == "succeeded"
                    else "Navigation failed by test Robot Agent"
                ),
            }
        )

        receipt = websocket.receive_json()

        assert (
            receipt["type"]
            == "navigation_result_received"
        )
        assert receipt["accepted"] is True

    return client.get(f"/api/tasks/{task_id}")


def advance(task_id: str, event: str):
    if event == "ARRIVED_PICKUP":
        return report_navigation_result(
            task_id,
            "pickup",
        )

    if event == "ARRIVED_DESTINATION":
        return report_navigation_result(
            task_id,
            "destination",
        )

    if event == "NAVIGATION_FAILED":
        current = client.get(
            f"/api/tasks/{task_id}"
        ).json()

        stage = (
            "pickup"
            if current["status"] == "GOING_TO_PICKUP"
            else "destination"
        )

        return report_navigation_result(
            task_id,
            stage,
            "aborted",
        )

    return client.post(
        f"/api/tasks/{task_id}/events",
        json={"event": event},
    )


def test_health_reports_phase4_state_machine():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["phase"] == "4"
    assert body["workflow"] == "state-machine"


def test_create_complete_and_history_is_persisted():
    task = create_task()
    assert task["status"] == "GOING_TO_PICKUP"
    task_id = task["id"]

    transitions = [
        ("ARRIVED_PICKUP", "WAITING_FOR_LOADING"),
        ("CONFIRM_LOADED", "DELIVERING"),
        ("ARRIVED_DESTINATION", "WAITING_FOR_UNLOADING"),
        ("CONFIRM_RECEIVED", "COMPLETED"),
    ]
    for event, expected in transitions:
        response = advance(task_id, event)
        assert response.status_code == 200
        assert response.json()["status"] == expected

    history = client.get(f"/api/tasks/{task_id}/history")
    assert history.status_code == 200
    event_types = [item["event_type"] for item in history.json()]
    event_sources = {
        item["event_type"]: item["source"]
        for item in history.json()
    }
    assert event_types == [
        "TASK_CREATED",
        "TASK_ASSIGNED",
        "ARRIVED_PICKUP",
        "CONFIRM_LOADED",
        "ARRIVED_DESTINATION",
        "CONFIRM_RECEIVED",
    ]

    overview = client.get("/api/overview").json()
    assert overview["robot"]["state"] == "IDLE"
    assert overview["active_task"] is None
    assert (
        event_sources["ARRIVED_PICKUP"]
        == "ROBOT_AGENT"
    )
    assert (
        event_sources["ARRIVED_DESTINATION"]
        == "ROBOT_AGENT"
    )
    assert (
        event_sources["CONFIRM_LOADED"]
        == "WEB_OPERATOR"
    )
    assert (
        event_sources["CONFIRM_RECEIVED"]
        == "WEB_OPERATOR"
    )

def test_invalid_transition_is_rejected():
    task = create_task()
    response = advance(task["id"], "CONFIRM_LOADED")
    assert response.status_code == 409
    assert "Allowed events" in response.json()["detail"]

    current = client.get(f"/api/tasks/{task['id']}").json()
    assert current["status"] == "GOING_TO_PICKUP"

def test_web_operator_cannot_report_navigation_events():
    task = create_task()

    protected_events = [
        "ARRIVED_PICKUP",
        "ARRIVED_DESTINATION",
        "NAVIGATION_FAILED",
    ]

    for event in protected_events:
        response = client.post(
            f"/api/tasks/{task['id']}/events",
            json={
                "event": event,
                "source": "ROBOT_AGENT",
            },
        )

        assert response.status_code == 403
        assert (
            "ROS 2 Robot Agent"
            in response.json()["detail"]
        )

    current = client.get(
        f"/api/tasks/{task['id']}"
    )

    assert current.status_code == 200
    assert (
        current.json()["status"]
        == "GOING_TO_PICKUP"
    )

def test_second_task_is_queued_and_auto_dispatches():
    first = create_task("A", "C")
    second = create_task("B", "D")

    assert first["status"] == "GOING_TO_PICKUP"
    assert second["status"] == "QUEUED"

    for event in ["ARRIVED_PICKUP", "CONFIRM_LOADED", "ARRIVED_DESTINATION", "CONFIRM_RECEIVED"]:
        response = advance(first["id"], event)
        assert response.status_code == 200

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"
    assert second_after["robot_id"] == "robot01"

def test_cancel_active_task_waits_for_robot_confirmation():
    with robot_websocket_connect() as websocket:
        connection = websocket.receive_json()
        assert connection["type"] == "connection_ack"

        first = create_task("A", "C")
        first_command = websocket.receive_json()

        assert first_command["type"] == "command"
        assert first_command["task_id"] == first["id"]
        assert first_command["stage"] == "pickup"

        second = create_task("B", "D")
        assert second["status"] == "QUEUED"

        cancel = client.post(
            f"/api/tasks/{first['id']}/cancel"
        )

        assert cancel.status_code == 200
        assert cancel.json()["status"] == "CANCELLED"

        cancel_command = websocket.receive_json()

        assert (
            cancel_command["type"]
            == "cancel_navigation"
        )
        assert (
            cancel_command["task_id"]
            == first["id"]
        )
        assert cancel_command["cancel_id"].startswith(
            f"{first['id']}:cancel:"
        )

        robot_before = client.get(
            "/api/robots/robot01"
        ).json()
        second_before = client.get(
            f"/api/tasks/{second['id']}"
        ).json()

        # FastAPI must retain the robot lock until
        # Robot Agent confirms that Nav2 stopped.
        assert (
            robot_before["current_task_id"]
            == first["id"]
        )
        assert second_before["status"] == "QUEUED"

        websocket.send_json(
            {
                "type": "navigation_cancelled",
                "cancel_id": (
                    cancel_command["cancel_id"]
                ),
                "task_id": first["id"],
                "cancelled": True,
                "detail": (
                    "Nav2 cancellation confirmed"
                ),
            }
        )

        receipt = websocket.receive_json()

        assert (
            receipt["type"]
            == "navigation_cancelled_received"
        )
        assert receipt["accepted"] is True
        assert receipt["task_id"] == first["id"]
        assert receipt["task_status"] == "CANCELLED"

        next_command = websocket.receive_json()

        assert next_command["type"] == "command"
        assert next_command["task_id"] == second["id"]
        assert next_command["stage"] == "pickup"

        second_after = client.get(
            f"/api/tasks/{second['id']}"
        ).json()
        robot_after = client.get(
            "/api/robots/robot01"
        ).json()

        assert (
            second_after["status"]
            == "GOING_TO_PICKUP"
        )
        assert (
            robot_after["current_task_id"]
            == second["id"]
        )

        history = client.get(
            f"/api/tasks/{first['id']}/history"
        )
        assert history.status_code == 200

        history_by_type = {
            item["event_type"]: item
            for item in history.json()
        }

        assert (
            history_by_type["TASK_CANCELLED"][
                "source"
            ]
            == "WEB_OPERATOR"
        )
        assert (
            history_by_type["NAVIGATION_CANCELLED"][
                "source"
            ]
            == "ROBOT_AGENT"
        )


def test_navigation_failure_and_retry():
    task = create_task("A", "C")

    failed = advance(task["id"], "NAVIGATION_FAILED")
    assert failed.status_code == 200
    assert failed.json()["status"] == "FAILED"

    robot = client.get("/api/robots/robot01").json()
    assert robot["state"] == "IDLE"
    assert robot["current_task_id"] is None

    retried = client.post(f"/api/tasks/{task['id']}/retry")
    assert retried.status_code == 200
    assert retried.json()["status"] == "GOING_TO_PICKUP"

    robot_after = client.get("/api/robots/robot01").json()
    assert robot_after["state"] == "GOING_TO_PICKUP"
    assert robot_after["current_task_id"] == task["id"]


def test_robot_offline_fails_active_task_and_online_dispatches_queue():
    first = create_task("A", "C")
    second = create_task("B", "D")

    offline = client.post("/api/robots/robot01/offline")
    assert offline.status_code == 200
    assert offline.json()["state"] == "OFFLINE"
    assert offline.json()["online"] is False

    first_after = client.get(f"/api/tasks/{first['id']}").json()
    assert first_after["status"] == "FAILED"

    second_before = client.get(f"/api/tasks/{second['id']}").json()
    assert second_before["status"] == "QUEUED"

    online = client.post("/api/robots/robot01/online")
    assert online.status_code == 200
    assert online.json()["online"] is True

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"


def test_navigation_failure_auto_recovers_and_dispatches_queued_task():
    first = create_task("A", "C")
    second = create_task("B", "D")
    advance(first["id"], "NAVIGATION_FAILED")

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"
    robot = client.get("/api/robots/robot01").json()
    assert robot["state"] == "GOING_TO_PICKUP"
    assert robot["current_task_id"] == second["id"]


def test_reject_same_pickup_and_destination():
    response = client.post(
        "/api/tasks",
        json={"pickup_station_id": "A", "destination_station_id": "A"},
    )
    assert response.status_code == 422


def test_task_persists_across_database_sessions():
    created = create_task("A", "B")
    fetched = client.get(f"/api/tasks/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]
    assert fetched.json()["pickup_station_id"] == "A"

def test_robot_websocket_heartbeat_round_trip():
    with robot_websocket_connect() as websocket:
        connection = websocket.receive_json()

        assert connection["type"] == "connection_ack"
        assert connection["robot_id"] == "robot01"
        assert connection["connected"] is True

        websocket.send_json(
            {
                "type": "heartbeat",
                "timestamp": "2026-08-31T13:30:00+07:00",
            }
        )

        response = websocket.receive_json()

        assert response["type"] == "heartbeat_ack"
        assert response["robot_id"] == "robot01"
        assert (
            response["received_timestamp"]
            == "2026-08-31T13:30:00+07:00"
        )

    connections = client.get(
        "/api/robot-connections"
    )

    assert connections.status_code == 200
    assert connections.json()["count"] == 0
    assert connections.json()["connected_robot_ids"] == []


def test_robot_websocket_rejects_unknown_message():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "unknown_command",
            }
        )

        response = websocket.receive_json()

        assert response["type"] == "error"
        assert (
            response["code"]
            == "UNSUPPORTED_MESSAGE_TYPE"
        )


def test_robot_diagnostics_broadcasts_dashboard_update(
    monkeypatch,
):
    timestamp = "2026-09-03T09:15:30.123456+00:00"
    dashboard_events: list[dict] = []
    websocket = StubWebSocket(
        [
            {
                "type": "diagnostics",
                "timestamp": timestamp,
                "statuses": [
                    {
                        "name": "AMR/LiDAR",
                        "level": "OK",
                        "message": "LaserScan healthy",
                        "hardware_id": (
                            "turtlebot3_waffle_sim"
                        ),
                        "values": [
                            {
                                "key": "topic",
                                "value": "/scan",
                            },
                            {
                                "key": "topic",
                                "value": "/scan/remapped",
                            },
                            {
                                "key": "age_seconds",
                                "value": "0.12",
                            },
                        ],
                    },
                    {
                        "name": "AMR/Localization",
                        "level": "STALE",
                        "message": "AMCL pose data timeout",
                        "hardware_id": (
                            "turtlebot3_waffle_sim"
                        ),
                        "values": [
                            {
                                "key": "topic",
                                "value": "/amcl_pose",
                            },
                        ],
                    },
                ],
            }
        ]
    )

    async def capture_dashboard_event(
        message: dict, **_kwargs,
    ) -> None:
        dashboard_events.append(message)

    monkeypatch.setattr(
        browser_connection_manager,
        "broadcast_json",
        capture_dashboard_event,
    )

    with TestingSessionLocal() as db:
        asyncio.run(
            robot_websocket(
                websocket,
                "robot01",
                db,
            )
        )

    assert websocket.accepted is True
    assert websocket.sent[0]["type"] == "connection_ack"
    diagnostic_events = [
        event
        for event in dashboard_events
        if event["type"] == "robot_diagnostics"
    ]
    assert len(diagnostic_events) == 1
    dashboard_event = diagnostic_events[0]
    assert dashboard_event["robot_id"] == "robot01"
    assert dashboard_event["overall_level"] == "STALE"
    assert dashboard_event["timestamp"] == timestamp
    assert dashboard_event["statuses"][0] == {
        "name": "AMR/LiDAR",
        "level": "OK",
        "message": "LaserScan healthy",
        "hardware_id": "turtlebot3_waffle_sim",
        "values": [
            {
                "key": "topic",
                "value": "/scan",
            },
            {
                "key": "topic",
                "value": "/scan/remapped",
            },
            {
                "key": "age_seconds",
                "value": "0.12",
            },
        ],
    }
    assert dashboard_event["statuses"][1]["level"] == "STALE"
    assert dashboard_event["server_time"]


def test_robot_websocket_rejects_invalid_diagnostics():
    websocket = StubWebSocket(
        [
            {
                "type": "diagnostics",
                "timestamp": "not-a-timestamp",
                "statuses": [
                    {
                        "name": "AMR/LiDAR",
                        "level": "CRITICAL",
                        "message": "Invalid level",
                        "hardware_id": "simulation",
                        "values": [],
                    },
                ],
            },
            {
                "type": "heartbeat",
                "timestamp": None,
            },
        ]
    )

    with TestingSessionLocal() as db:
        asyncio.run(
            robot_websocket(
                websocket,
                "robot01",
                db,
            )
        )

    error = websocket.sent[1]
    assert error["type"] == "error"
    assert error["code"] == "INVALID_DIAGNOSTICS"
    heartbeat = websocket.sent[2]
    assert heartbeat["type"] == "heartbeat_ack"
    assert heartbeat["robot_id"] == "robot01"


def test_robot_websocket_persists_telemetry():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "telemetry",
                "data": {
                    "x": 2.8,
                    "y": 1.8,
                    "yaw": 0.75,
                    "battery": 76,
                    "frame_id": "map",
                    "timestamp": (
                        "2026-08-31T13:45:00+07:00"
                    ),
                },
            }
        )

        response = websocket.receive_json()

        assert response["type"] == "telemetry_ack"
        assert response["accepted"] is True
        assert response["data"]["x"] == 2.8
        assert response["data"]["battery"] == 76

    robot = client.get(
        "/api/robots/robot01"
    )

    assert robot.status_code == 200
    assert robot.json()["x"] == 2.8
    assert robot.json()["y"] == 1.8
    assert robot.json()["yaw"] == 0.75
    assert robot.json()["battery"] == 76


def test_robot_websocket_rejects_invalid_telemetry():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "telemetry",
                "data": {
                    "x": 1.0,
                    "y": 2.0,
                    "yaw": 0.0,
                    "battery": 150,
                },
            }
        )

        response = websocket.receive_json()

        assert response["type"] == "error"
        assert response["code"] == "INVALID_TELEMETRY"

def test_robot_receives_pickup_navigation_command():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        task = create_task("A", "C")
        command = websocket.receive_json()

        assert command["type"] == "command"
        assert command["command"] == "navigate_to_pose"
        assert command["task_id"] == task["id"]
        assert command["stage"] == "pickup"
        assert command["target"]["station_id"] == "A"
        assert command["target"]["frame_id"] == "map"
        assert command["command_id"].startswith(
            f"{task['id']}:pickup:"
        )

        websocket.send_json(
            {
                "type": "command_ack",
                "command_id": command["command_id"],
                "accepted": True,
                "detail": "Goal accepted by simulated agent",
            }
        )

        receipt = websocket.receive_json()

        assert (
            receipt["type"]
            == "command_ack_received"
        )
        assert (
            receipt["command_id"]
            == command["command_id"]
        )
        assert receipt["accepted"] is True

def test_robot_receives_destination_command():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        task = create_task("A", "C")

        pickup_command = websocket.receive_json()
        assert pickup_command["stage"] == "pickup"

        websocket.send_json(
            {
                "type": "navigation_result",
                "command_id": (
                    pickup_command["command_id"]
                ),
                "task_id": task["id"],
                "stage": "pickup",
                "status": "succeeded",
                "detail": "Nav2 reached pickup",
            }
        )

        pickup_receipt = websocket.receive_json()

        assert (
            pickup_receipt["type"]
            == "navigation_result_received"
        )
        assert (
            pickup_receipt["task_status"]
            == "WAITING_FOR_LOADING"
        )

        loaded = advance(
            task["id"],
            "CONFIRM_LOADED",
        )
        assert loaded.status_code == 200
        assert loaded.json()["status"] == "DELIVERING"

        destination_command = websocket.receive_json()

        assert destination_command["type"] == "command"
        assert destination_command["task_id"] == task["id"]
        assert destination_command["stage"] == "destination"
        assert (
            destination_command["target"]["station_id"]
            == "C"
        )
        assert destination_command["command_id"].startswith(
            f"{task['id']}:destination:"
        )

def test_navigation_result_advances_pickup():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        task = create_task("A", "C")
        command = websocket.receive_json()

        websocket.send_json(
            {
                "type": "navigation_result",
                "command_id": command["command_id"],
                "task_id": task["id"],
                "stage": "pickup",
                "status": "succeeded",
                "detail": "Nav2 reached pickup",
            }
        )

        receipt = websocket.receive_json()

        assert (
            receipt["type"]
            == "navigation_result_received"
        )
        assert receipt["accepted"] is True
        assert receipt["task_id"] == task["id"]
        assert receipt["stage"] == "pickup"
        assert (
            receipt["task_status"]
            == "WAITING_FOR_LOADING"
        )

def test_navigation_result_broadcasts_dashboard_update():
    with client.websocket_connect(
        "/ws/dashboard"
    ) as dashboard_websocket:
        dashboard_ack = (
            dashboard_websocket.receive_json()
        )

        assert (
            dashboard_ack["type"]
            == "dashboard_connection_ack"
        )

        # Consume the finite connection protocol before any domain operation.
        # An active path is the only possible extra initial dashboard event.
        receive_message_of_type(
            dashboard_websocket,
            "notification_snapshot",
            max_messages=2,
            skippable_types={"navigation_path"},
        )
        receive_message_of_type(
            dashboard_websocket,
            "alert_snapshot",
            max_messages=1,
        )
        receive_message_of_type(
            dashboard_websocket,
            "emergency_stop_snapshot",
            max_messages=1,
        )

        with robot_websocket_connect() as robot_websocket:
            robot_websocket.receive_json()

            # Robot connection is an intentional ADMIN operational event.
            # Drain and validate it before task creation so it cannot be
            # mistaken for the navigation-result notification.
            robot_connected = notification_identity(
                receive_message_of_type(
                    dashboard_websocket,
                    "notification_created",
                    max_messages=1,
                )
            )
            assert robot_connected["id"]
            assert robot_connected["event_type"] == "robot.connected"
            assert robot_connected["entity_type"] == "robot"
            assert robot_connected["entity_id"] == "robot01"

            task = create_task("A", "C")

            # With an available robot, canonical creation commits two distinct
            # task transitions. Their IDs and semantic keys must be distinct.
            created_identity = notification_identity(
                receive_message_of_type(
                    dashboard_websocket,
                    "notification_created",
                    max_messages=1,
                )
            )
            dispatched_identity = notification_identity(
                receive_message_of_type(
                    dashboard_websocket,
                    "notification_created",
                    max_messages=1,
                )
            )
            assert created_identity["id"]
            assert created_identity["event_type"] == "task.created"
            assert created_identity["entity_type"] == "task"
            assert created_identity["entity_id"] == task["id"]
            assert dispatched_identity["id"]
            assert dispatched_identity["event_type"] == "task.dispatched"
            assert dispatched_identity["entity_type"] == "task"
            assert dispatched_identity["entity_id"] == task["id"]
            assert created_identity["id"] != dispatched_identity["id"]

            command = robot_websocket.receive_json()

            robot_websocket.send_json(
                {
                    "type": "navigation_result",
                    "command_id": command["command_id"],
                    "task_id": task["id"],
                    "stage": "pickup",
                    "status": "succeeded",
                    "detail": "Nav2 reached pickup",
                }
            )

            receipt = robot_websocket.receive_json()

            assert (
                receipt["type"]
                == "navigation_result_received"
            )

        transition_notification_ids: list[str | None] = []

        def validate_transition_notification(message: dict) -> None:
            identity = notification_identity(message)
            transition_notification_ids.append(identity["id"])
            assert identity["id"]
            assert identity["event_type"] == "task.arrived_pickup"
            assert identity["entity_type"] == "task"
            assert identity["entity_id"] == task["id"]

        # The result publishes one targeted transition notification and may
        # clear the active path before the existing public workflow event. The
        # finite budget is exactly notification + path clear + target event.
        dashboard_event = receive_message_of_type(
            dashboard_websocket,
            "workflow_updated",
            max_messages=3,
            skippable_types={
                "notification_created",
                "navigation_path_clear",
            },
            skipped_message_validators={
                "notification_created": validate_transition_notification,
            },
        )

        assert transition_notification_ids
        assert len(transition_notification_ids) == len(
            set(transition_notification_ids)
        )

        assert (
            dashboard_event["type"]
            == "workflow_updated"
        )
        assert (
            dashboard_event["reason"]
            == "navigation_result"
        )
        assert dashboard_event["task_id"] == task["id"]
        assert dashboard_event["robot_id"] == "robot01"
        assert dashboard_event["stage"] == "pickup"
        assert (
            dashboard_event["navigation_status"]
            == "succeeded"
        )
        assert (
            dashboard_event["task_status"]
            == "WAITING_FOR_LOADING"
        )
def test_navigation_failure_marks_task_failed():
    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        task = create_task("A", "C")
        command = websocket.receive_json()

        websocket.send_json(
            {
                "type": "navigation_result",
                "command_id": command["command_id"],
                "task_id": task["id"],
                "stage": "pickup",
                "status": "aborted",
                "detail": "Nav2 goal aborted",
            }
        )

        receipt = websocket.receive_json()

        assert (
            receipt["type"]
            == "navigation_result_received"
        )
        assert receipt["accepted"] is True
        assert receipt["navigation_status"] == "aborted"
        assert receipt["task_status"] == "FAILED"

def test_robot_map_updates_api_snapshot():
    map_store.clear()

    missing = client.get("/api/map")
    assert missing.status_code == 404

    with robot_websocket_connect() as websocket:
        websocket.receive_json()

        websocket.send_json(
            {
                "type": "map",
                "data": {
                    "frame_id": "map",
                    "resolution": 0.05,
                    "width": 2,
                    "height": 2,
                    "origin_x": -1.0,
                    "origin_y": -2.0,
                    "origin_yaw": 0.0,
                    "data": [-1, 0, 50, 100],
                    "timestamp": None,
                },
            }
        )

        receipt = websocket.receive_json()

        assert receipt["type"] == "map_ack"
        assert receipt["revision"] == 1
        assert receipt["width"] == 2
        assert receipt["height"] == 2

    response = client.get("/api/map")

    assert response.status_code == 200
    snapshot = response.json()
    assert snapshot["frame_id"] == "map"
    assert snapshot["data"] == [-1, 0, 50, 100]
    assert snapshot["revision"] == 1

    map_store.clear()

def test_navigation_feedback_broadcasts_dashboard_update(
    monkeypatch,
):
    dashboard_events: list[dict] = []

    async def capture_dashboard_event(
        message: dict, **_kwargs,
    ) -> None:
        dashboard_events.append(message)

    with robot_websocket_connect() as robot_websocket:
        robot_ack = robot_websocket.receive_json()

        assert (
            robot_ack["type"]
            == "connection_ack"
        )

        task = create_task("A", "C")
        command = robot_websocket.receive_json()

        assert command["type"] == "command"
        assert command["task_id"] == task["id"]
        assert command["stage"] == "pickup"

        monkeypatch.setattr(
            browser_connection_manager,
            "broadcast_json",
            capture_dashboard_event,
        )

        robot_websocket.send_json(
            {
                "type": "navigation_feedback",
                "command_id": command["command_id"],
                "task_id": task["id"],
                "stage": "pickup",
                "distance_remaining": 4.25,
                "navigation_time_seconds": 12.5,
                (
                    "estimated_time_"
                    "remaining_seconds"
                ): 18.75,
                "number_of_recoveries": 1,
                "linear_velocity": 0.42,
                "angular_velocity": -0.18,
                "current_pose": {
                    "frame_id": "map",
                    "x": 2.1,
                    "y": 3.2,
                    "yaw": 0.4,
                },
                "timestamp": (
                    "2026-09-02T16:30:00+00:00"
                ),
            }
        )

        # ใช้ heartbeat เป็น synchronization barrier:
        # เมื่อได้รับ ack แปลว่า feedback ก่อนหน้าถูกประมวลผลแล้ว
        robot_websocket.send_json(
            {
                "type": "heartbeat",
                "timestamp": (
                    "2026-09-02T16:30:01+00:00"
                ),
            }
        )

        heartbeat_ack = (
            robot_websocket.receive_json()
        )

        assert (
            heartbeat_ack["type"]
            == "heartbeat_ack"
        )

    feedback_events = [
        event
        for event in dashboard_events
        if event["type"] == "navigation_feedback"
    ]
    assert len(feedback_events) == 1
    dashboard_event = feedback_events[0]

    assert (
        dashboard_event["type"]
        == "navigation_feedback"
    )
    assert dashboard_event["robot_id"] == "robot01"
    assert (
        dashboard_event["command_id"]
        == command["command_id"]
    )
    assert dashboard_event["task_id"] == task["id"]
    assert dashboard_event["stage"] == "pickup"
    assert (
        dashboard_event["distance_remaining"]
        == 4.25
    )
    assert (
        dashboard_event["navigation_time_seconds"]
        == 12.5
    )
    assert (
        dashboard_event[
            "estimated_time_remaining_seconds"
        ]
        == 18.75
    )
    assert (
        dashboard_event["number_of_recoveries"]
        == 1
    )
    assert (
        dashboard_event["linear_velocity"]
        == 0.42
    )
    assert (
        dashboard_event["angular_velocity"]
        == -0.18
    )
    assert dashboard_event["current_pose"] == {
        "frame_id": "map",
        "x": 2.1,
        "y": 3.2,
        "yaw": 0.4,
    }
    assert "server_time" in dashboard_event
