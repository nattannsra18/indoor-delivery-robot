import asyncio
import os
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import sessionmaker

from app.alert_service import AlertService
from app.auth import SESSION_COOKIE_NAME, create_session, hash_password, token_digest
from app.database import Base, get_db
from app.db_models import AlertORM, DeliveryTaskORM, EmergencyStopORM, SessionORM, TaskEventORM, UserORM
from app.emergency_service import EmergencyStopService
from app.main import app
from app.models import AlertSeverity, DeliveryTaskCreate, UserRole, utc_now
from app.models import OccupancyGridPayload, TaskPriority
from app.routers.dashboard_ws import dashboard_websocket
from app.routers.robot_ws import robot_websocket
from app.seed import seed_database
from app.service import DeliveryService
from app.websocket_manager import robot_connection_manager
from app.map_store import map_store
from app.route_preview import route_preview_coordinator

DB_PATH = Path(__file__).parent / "step9_test.db"
engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
Session = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)


def override_db():
    with Session() as db:
        yield db


@pytest.fixture(autouse=True)
def reset_database(monkeypatch):
    app.dependency_overrides[get_db] = override_db
    monkeypatch.delenv("ROBOT_WS_TOKEN", raising=False)
    monkeypatch.setenv("APP_ENV", "development")
    with Session() as db:
        for model in (TaskEventORM, DeliveryTaskORM, SessionORM, AlertORM, EmergencyStopORM, UserORM):
            db.execute(delete(model))
        db.commit()
        seed_database(db)
        db.add_all([
            UserORM(id="admin", username="admin", password_hash=hash_password("admin-pass", iterations=1000), role=UserRole.ADMIN),
            UserORM(id="alice", username="alice", password_hash=hash_password("alice-pass", iterations=1000), role=UserRole.USER),
            UserORM(id="bob", username="bob", password_hash=hash_password("bob-pass", iterations=1000), role=UserRole.USER),
            UserORM(id="disabled", username="disabled", password_hash=hash_password("disabled-pass", iterations=1000), role=UserRole.USER, active=False),
        ])
        db.commit()
    robot_connection_manager._connections.clear()
    route_preview_coordinator.clear()
    map_store.clear()
    map_store.update(OccupancyGridPayload(
        frame_id="map", resolution=1.0, width=1, height=1,
        origin_x=0.0, origin_y=0.0, origin_yaw=0.0, data=[0],
    ))
    yield
    app.dependency_overrides.pop(get_db, None)
    robot_connection_manager._connections.clear()
    route_preview_coordinator.clear()
    map_store.clear()


def task_preview_id(owner_id, pickup, destination, priority=TaskPriority.NORMAL):
    snapshot = map_store.get()
    assert snapshot is not None
    return route_preview_coordinator.issue_validation(
        owner_id=owner_id,
        robot_id="robot01",
        pickup_station_id=pickup,
        destination_station_id=destination,
        priority=priority,
        map_revision=snapshot.revision,
    )


def login(client: TestClient, username="admin", password="admin-pass"):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 200
    return response


def test_authentication_hash_session_persistence_expiry_logout_and_generic_failure():
    client = TestClient(app)
    success = login(client)
    assert success.json() == {"id": "admin", "username": "admin", "role": "ADMIN"}
    assert "session" not in success.text.lower()
    raw_token = client.cookies.get(SESSION_COOKIE_NAME)
    assert raw_token
    with Session() as db:
        user = db.get(UserORM, "admin")
        session = db.scalar(select(SessionORM).where(SessionORM.user_id == "admin"))
        assert user.password_hash != "admin-pass"
        assert "admin-pass" not in user.password_hash
        assert session.token_hash == token_digest(raw_token)
        assert raw_token != session.token_hash
    assert client.get("/api/auth/me").status_code == 200
    reloaded_client = TestClient(app, cookies={SESSION_COOKIE_NAME: raw_token})
    assert reloaded_client.get("/api/auth/me").status_code == 200
    with Session() as db:
        session = db.scalar(select(SessionORM).where(SessionORM.user_id == "admin"))
        session.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
    assert reloaded_client.get("/api/auth/me").status_code == 401
    first = client.post("/api/auth/login", json={"username": "missing", "password": "bad"})
    second = client.post("/api/auth/login", json={"username": "admin", "password": "bad"})
    assert first.status_code == second.status_code == 401
    assert first.json() == second.json()
    assert client.post("/api/auth/login", json={"username": "disabled", "password": "disabled-pass"}).status_code == 401
    login(client)
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401


def test_rbac_task_ownership_and_legacy_ownerless_safety():
    assert TestClient(app).post("/api/tasks", json={"pickup_station_id": "A", "destination_station_id": "B"}).status_code == 401
    alice = TestClient(app); login(alice, "alice", "alice-pass")
    bob = TestClient(app); login(bob, "bob", "bob-pass")
    admin = TestClient(app); login(admin)
    created = alice.post("/api/tasks", json={
        "pickup_station_id": "A",
        "destination_station_id": "B",
        "preview_id": task_preview_id("alice", "A", "B"),
    })
    assert created.status_code == 201
    assert created.json()["owner_id"] == "alice"
    task_id = created.json()["id"]
    assert bob.get(f"/api/tasks/{task_id}").status_code == 403
    assert bob.post(f"/api/tasks/{task_id}/cancel").status_code == 403
    assert admin.post(f"/api/tasks/{task_id}/cancel").status_code == 200
    assert alice.post("/api/stations", json={"name": "No", "x": 0, "y": 0, "yaw": 0}).status_code == 403
    with Session() as db:
        legacy = DeliveryService(db).create_task(DeliveryTaskCreate(pickup_station_id="B", destination_station_id="C"))
        legacy_id = legacy.id
    assert alice.get(f"/api/tasks/{legacy_id}").status_code == 403
    assert admin.get(f"/api/tasks/{legacy_id}").status_code == 200


class StubSocket:
    def __init__(self, messages=(), cookies=None, headers=None):
        self.messages = iter(messages); self.cookies = cookies or {}; self.headers = headers or {}
        self.sent = []; self.accepted = False; self.closed = None
    async def accept(self): self.accepted = True
    async def send_json(self, value): self.sent.append(value)
    async def receive_json(self):
        try: return next(self.messages)
        except StopIteration as error: raise WebSocketDisconnect() from error
    async def close(self, code=1000, reason=""): self.closed = (code, reason)


def test_dashboard_websocket_requires_live_session_and_rejects_spoofing():
    assert TestClient(app).get("/api/dashboard-connections").status_code == 401
    with Session() as db:
        user = db.get(UserORM, "admin")
        token, session = create_session(db, user)
        socket = StubSocket([{"type": "navigation_result"}], cookies={SESSION_COOKIE_NAME: token})
        asyncio.run(dashboard_websocket(socket, db))
        assert socket.accepted
        assert any(item.get("code") == "UNSUPPORTED_MESSAGE" for item in socket.sent)
        session.revoked_at = utc_now(); db.commit()
        rejected = StubSocket(cookies={SESSION_COOKIE_NAME: token})
        asyncio.run(dashboard_websocket(rejected, db))
        assert not rejected.accepted and rejected.closed[0] == 1008
        missing = StubSocket()
        asyncio.run(dashboard_websocket(missing, db))
        assert missing.closed[0] == 1008


def test_robot_websocket_uses_separate_bearer_credential(monkeypatch):
    monkeypatch.setenv("ROBOT_WS_TOKEN", "robot-secret")
    with Session() as db:
        missing = StubSocket()
        asyncio.run(robot_websocket(missing, "robot01", db))
        assert missing.closed[0] == 1008
        wrong = StubSocket(headers={"authorization": "Bearer browser-session"})
        asyncio.run(robot_websocket(wrong, "robot01", db))
        assert wrong.closed[0] == 1008
        valid = StubSocket(headers={"authorization": "Bearer robot-secret"})
        asyncio.run(robot_websocket(valid, "robot01", db))
        assert valid.accepted and valid.sent[0]["type"] == "connection_ack"


def test_alert_deduplication_recovery_reopen_and_admin_actions():
    with Session() as db:
        alerts = AlertService(db)
        first, event = alerts.upsert("diagnostic:robot01:lidar", AlertSeverity.WARNING, "LiDAR WARN", "timeout", "DIAGNOSTIC", "robot01")
        timestamp = first.latest_occurrence_at
        second, event2 = alerts.upsert("diagnostic:robot01:lidar", AlertSeverity.CRITICAL, "LiDAR ERROR", "lost", "DIAGNOSTIC", "robot01")
        assert first.id == second.id and second.occurrence_count == 2
        assert second.latest_occurrence_at >= timestamp and event2 == "occurrence_updated"
        alerts.resolve_key("diagnostic:robot01:lidar")
        reopened, event3 = alerts.upsert("diagnostic:robot01:lidar", AlertSeverity.WARNING, "LiDAR WARN", "again", "DIAGNOSTIC", "robot01")
        assert event3 == "reopened" and reopened.active and reopened.occurrence_count == 3
        assert alerts.get_by_key("diagnostic:robot01:lidar").id == reopened.id
        alert_id = reopened.id
    user = TestClient(app); login(user, "alice", "alice-pass")
    assert user.get("/api/alerts").status_code == 403
    admin = TestClient(app); login(admin)
    assert admin.post(f"/api/alerts/{alert_id}/acknowledge").json()["acknowledged"] is True
    assert admin.post(f"/api/alerts/{alert_id}/resolve").json()["active"] is False


class ConnectedRobot:
    def __init__(self): self.sent = []
    async def send_json(self, value): self.sent.append(value)


def test_emergency_stop_latches_terminates_task_clears_dispatch_and_requires_matching_ack():
    admin = TestClient(app); login(admin)
    created = admin.post("/api/tasks", json={
        "pickup_station_id": "A",
        "destination_station_id": "C",
        "preview_id": task_preview_id("admin", "A", "C"),
    }).json()
    robot = ConnectedRobot(); robot_connection_manager._connections["robot01"] = robot
    stopped = admin.post("/api/robots/robot01/emergency-stop")
    assert stopped.status_code == 200 and stopped.json()["latched"] is True
    assert robot.sent[-1]["command"] == "emergency_stop"
    command_id = robot.sent[-1]["command_id"]
    with Session() as db:
        service = EmergencyStopService(db)
        assert db.get(DeliveryTaskORM, created["id"]).status.value == "FAILED"
        assert service.is_latched("robot01")
        assert DeliveryService(db).build_navigation_command(db.get(DeliveryTaskORM, created["id"])) is None
        state, matched = service.acknowledge("robot01", "stale", "emergency_stop", True, None)
        assert not matched and state.latched
        state, matched = service.acknowledge("robot01", command_id, "emergency_stop", True, None)
        assert matched and state.state.value == "STOPPED"
    reset = admin.post("/api/robots/robot01/emergency-stop/reset")
    reset_id = robot.sent[-1]["command_id"]
    assert reset.json()["state"] == "RESET_REQUESTED"
    with Session() as db:
        state, matched = EmergencyStopService(db).acknowledge("robot01", reset_id, "emergency_stop_reset", True, None)
        assert matched and not state.latched and state.state.value == "NORMAL"
        assert db.get(DeliveryTaskORM, created["id"]).status.value == "FAILED"
        assert db.get(EmergencyStopORM, "robot01").state.value == "NORMAL"
