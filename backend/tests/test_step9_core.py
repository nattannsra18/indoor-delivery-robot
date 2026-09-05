import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi import BackgroundTasks, HTTPException, Request, Response, WebSocketDisconnect
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.alert_service import AlertService
from app.auth import (
    SESSION_COOKIE_NAME,
    authenticate,
    create_session,
    hash_password,
    require_admin,
    resolve_session,
    revoke_session,
    robot_authorization_valid,
    token_digest,
    verify_password,
)
from app.browser_websocket_manager import BrowserConnectionManager
from app.database import Base
from app.db_models import (
    AlertORM,
    DeliveryTaskORM,
    EmergencyStopORM,
    RobotORM,
    PasswordResetTokenORM,
    SessionORM,
    StationORM,
    TaskEventORM,
    UserORM,
)
from app.emergency_service import EmergencyStopService
from app.models import AlertSeverity, DeliveryTaskCreate, ForgotPasswordRequest, LoginRequest, ResetPasswordRequest, SignupRequest, UserRole, utc_now
from app.routers.auth import approve_account, forgot_password, get_password_policy, login, pending_accounts, reset_password, signup
from app.routers.dashboard_ws import dashboard_websocket
from app.routers.tasks import authorize_task, list_tasks as list_visible_tasks
from app.seed import seed_database
from app.service import DeliveryService


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Session = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def reset_database(monkeypatch):
    monkeypatch.setenv("APP_ENV", "development")
    monkeypatch.delenv("ROBOT_WS_TOKEN", raising=False)
    with Session() as db:
        for model in (
            TaskEventORM,
            DeliveryTaskORM,
            SessionORM,
            PasswordResetTokenORM,
            AlertORM,
            EmergencyStopORM,
            UserORM,
            RobotORM,
            StationORM,
        ):
            db.execute(delete(model))
        db.commit()
        seed_database(db)
        db.add_all(
            [
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
            ]
        )
        db.commit()


def request(*, cookie: str | None = None) -> Request:
    headers = []
    if cookie is not None:
        headers.append((b"cookie", f"{SESSION_COOKIE_NAME}={cookie}".encode()))
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": headers,
            "client": ("127.0.0.1", 1234),
        }
    )


def test_password_hashing_verification_and_generic_login_failure(monkeypatch):
    encoded = hash_password("correct", iterations=1000)
    assert encoded != "correct"
    assert verify_password("correct", encoded)
    assert not verify_password("wrong", encoded)
    monkeypatch.setattr("app.routers.auth.time.sleep", lambda _seconds: None)
    with Session() as db:
        missing = login(LoginRequest(username="missing", password="bad"), request(), Response(), db)
        wrong = login(LoginRequest(username="admin", password="bad"), request(), Response(), db)
        assert missing.status_code == wrong.status_code == 401
        assert missing.body == wrong.body
        assert authenticate(db, "missing", "bad") is None
        assert authenticate(db, "admin", "bad") is None


def test_login_accepts_email_and_new_signup_waits_for_approval(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM_EMAIL", raising=False)
    with Session() as db:
        alice = db.get(UserORM, "alice")
        alice.email = "alice@example.com"
        db.commit()
        response = Response()
        authenticated = login(
            LoginRequest(identifier="ALICE@example.com", password="alice-pass"),
            request(),
            response,
            db,
        )
        assert authenticated.id == "alice"
        assert SESSION_COOKIE_NAME in response.headers["set-cookie"]

        result = signup(
            SignupRequest(
                email="new.user@example.com",
                username="new.user",
                password="secure123",
            ),
            db,
        )
        pending = db.scalar(select(UserORM).where(UserORM.username == "new.user"))
        assert result.status == "PENDING_APPROVAL"
        assert pending is not None
        assert pending.email == "new.user@example.com"
        assert pending.active is False
        admin = db.get(UserORM, "admin")
        assert [account.id for account in pending_accounts(admin, db)] == [pending.id]
        background_tasks = BackgroundTasks()
        approved = approve_account(pending.id, background_tasks, admin, db)
        assert approved.active is True
        assert len(background_tasks.tasks) == 0


def test_account_approval_schedules_email_when_smtp_is_configured(monkeypatch):
    monkeypatch.setenv("SMTP_HOST", "smtp.example.com")
    monkeypatch.setenv("SMTP_FROM_EMAIL", "robot@example.com")
    with Session() as db:
        pending = UserORM(
            id="pending-email", username="pending-email", email="pending@example.com",
            password_hash=hash_password("secure123", iterations=1000),
            role=UserRole.USER, active=False,
        )
        db.add(pending); db.commit()
        background_tasks = BackgroundTasks()
        admin = db.get(UserORM, "admin")
        approve_account(pending.id, background_tasks, admin, db)
        assert len(background_tasks.tasks) == 1
        assert background_tasks.tasks[0].func.__name__ == "_send_approval_email"
        with pytest.raises(HTTPException) as duplicate:
            approve_account(pending.id, BackgroundTasks(), admin, db)
        assert duplicate.value.status_code == 409


def test_password_policy_is_shared_by_signup_and_reset(monkeypatch):
    monkeypatch.setenv("PASSWORD_MIN_LENGTH", "9")
    policy = get_password_policy()
    assert policy.minimum_length == 9
    assert policy.require_letter is True
    assert policy.require_number is True
    with pytest.raises(ValueError):
        SignupRequest(email="valid@example.com", username="valid-user", password="short1")
    with pytest.raises(ValueError):
        ResetPasswordRequest(token="x" * 32, password="onlyletters")
    assert SignupRequest(email="valid@example.com", username="valid-user", password="secure123").password == "secure123"


def test_password_reset_token_is_one_time_and_revokes_sessions():
    raw_token = "reset-token-that-is-long-enough-for-validation"
    with Session() as db:
        alice = db.get(UserORM, "alice")
        session_token, _ = create_session(db, alice)
        db.add(
            PasswordResetTokenORM(
                id="reset-alice",
                token_hash=token_digest(raw_token),
                user_id=alice.id,
                expires_at=utc_now() + timedelta(minutes=5),
            )
        )
        db.commit()
        result = reset_password(
            ResetPasswordRequest(token=raw_token, password="updated2"),
            db,
        )
        assert result.status_code == 204
        assert verify_password("updated2", alice.password_hash)
        assert resolve_session(db, session_token) is None
        repeated = reset_password(
            ResetPasswordRequest(token=raw_token, password="another3"),
            db,
        )
        assert repeated.status_code == 400


def test_forgot_password_response_does_not_reveal_account(monkeypatch):
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM_EMAIL", raising=False)
    with Session() as db:
        alice = db.get(UserORM, "alice")
        alice.email = "alice@example.com"
        db.commit()
        existing = forgot_password(
            ForgotPasswordRequest(email="alice@example.com"), BackgroundTasks(), db
        )
        missing = forgot_password(
            ForgotPasswordRequest(email="missing@example.com"), BackgroundTasks(), db
        )
        assert existing == missing
        assert existing.accepted is True
        assert existing.delivery_configured is False


def test_session_hash_persistence_expiration_and_revocation():
    with Session() as db:
        user = db.get(UserORM, "admin")
        token, session = create_session(db, user)
        session_id = session.id
        assert session.token_hash == token_digest(token)
        assert session.token_hash != token
        assert resolve_session(db, token).id == "admin"
    with Session() as db:
        assert resolve_session(db, token).id == "admin"
        session = db.get(SessionORM, session_id)
        session.expires_at = utc_now() - timedelta(seconds=1)
        db.commit()
        assert resolve_session(db, token) is None
        session.expires_at = utc_now() + timedelta(minutes=5)
        db.commit()
        revoke_session(db, token)
        assert resolve_session(db, token) is None


def test_admin_user_authorization_and_task_ownership():
    with Session() as db:
        admin = db.get(UserORM, "admin")
        alice = db.get(UserORM, "alice")
        bob = db.get(UserORM, "bob")
        assert require_admin(admin) is admin
        with pytest.raises(HTTPException) as denied:
            require_admin(alice)
        assert denied.value.status_code == 403
        owned = DeliveryService(db).create_task(
            DeliveryTaskCreate(pickup_station_id="A", destination_station_id="B"),
            owner_id=alice.id,
        )
        assert owned.owner_id == alice.id
        authorize_task(alice, owned)
        authorize_task(admin, owned)
        with pytest.raises(HTTPException) as forbidden:
            authorize_task(bob, owned)
        assert forbidden.value.status_code == 403
        legacy = SimpleNamespace(owner_id=None)
        with pytest.raises(HTTPException):
            authorize_task(alice, legacy)
        authorize_task(admin, legacy)


def test_role_task_listing_uses_server_enforced_ownership():
    with Session() as db:
        alice = db.get(UserORM, "alice")
        bob = db.get(UserORM, "bob")
        admin = db.get(UserORM, "admin")
        service = DeliveryService(db)
        alice_task = service.create_task(
            DeliveryTaskCreate(pickup_station_id="A", destination_station_id="B"),
            owner_id=alice.id,
        )
        bob_task = service.create_task(
            DeliveryTaskCreate(pickup_station_id="B", destination_station_id="C"),
            owner_id=bob.id,
        )
        legacy_task = service.create_task(
            DeliveryTaskCreate(pickup_station_id="C", destination_station_id="D")
        )

        alice_ids = {
            item.id for item in list_visible_tasks(None, service, alice)
        }
        admin_ids = {
            item.id for item in list_visible_tasks(None, service, admin)
        }
        assert alice_ids == {alice_task.id}
        assert {alice_task.id, bob_task.id, legacy_task.id} <= admin_ids

        alice_page, alice_total = service.list_tasks_page(None, alice.id, alice_task.id, 0, 20)
        assert [item.id for item in alice_page] == [alice_task.id]
        assert alice_total == 1
        bob_search, bob_total = service.list_tasks_page(None, None, "bob", 0, 1)
        assert [item.id for item in bob_search] == [bob_task.id]
        assert bob_total == 1


def test_browser_websocket_admin_only_broadcast_filtering():
    class Socket:
        def __init__(self):
            self.accepted = False
            self.messages = []

        async def accept(self):
            self.accepted = True

        async def send_json(self, message):
            self.messages.append(message)

    async def exercise():
        manager = BrowserConnectionManager()
        admin_socket = Socket()
        user_socket = Socket()
        await manager.connect(admin_socket, UserRole.ADMIN, "admin")
        await manager.connect(user_socket, UserRole.USER, "alice")

        admin_message = {"type": "robot_diagnostics"}
        await manager.broadcast_json(admin_message, admin_only=True)
        assert admin_socket.messages == [admin_message]
        assert user_socket.messages == []

        shared_message = {"type": "workflow_updated"}
        await manager.broadcast_json(shared_message)
        assert admin_socket.messages == [admin_message, shared_message]
        assert user_socket.messages == [shared_message]

    asyncio.run(exercise())


def test_alert_creation_deduplication_acknowledgement_and_resolution():
    with Session() as db:
        alerts = AlertService(db)
        first, event = alerts.upsert(
            "diagnostic:robot01:lidar",
            AlertSeverity.WARNING,
            "LiDAR warning",
            "timeout",
            "DIAGNOSTIC",
            "robot01",
        )
        second, second_event = alerts.upsert(
            "diagnostic:robot01:lidar",
            AlertSeverity.CRITICAL,
            "LiDAR error",
            "lost",
            "DIAGNOSTIC",
            "robot01",
        )
        assert event == "created"
        assert second_event == "occurrence_updated"
        assert second.id == first.id and second.occurrence_count == 2
        acknowledged = alerts.acknowledge(second.id, "admin")
        assert acknowledged.acknowledged
        assert acknowledged.acknowledged_by_user_id == "admin"
        resolved = alerts.resolve(second.id)
        assert not resolved.active and resolved.resolved_at is not None


def test_emergency_stop_latch_is_idempotent_and_terminates_task():
    with Session() as db:
        task = DeliveryService(db).create_task(
            DeliveryTaskCreate(pickup_station_id="A", destination_station_id="C"),
            owner_id="admin",
        )
        service = EmergencyStopService(db)
        state, command, created = service.activate("robot01")
        assert created and state.latched
        assert state.state.value == "STOP_REQUESTED"
        assert db.get(DeliveryTaskORM, task.id).status.value == "FAILED"
        assert DeliveryService(db).build_navigation_command(task) is None
        repeated, repeated_command, created_again = service.activate("robot01")
        assert not created_again
        assert repeated_command["command_id"] == command["command_id"]
        assert repeated.pending_command_id == state.pending_command_id


def test_emergency_ack_reset_and_no_old_task_resume():
    with Session() as db:
        task = DeliveryService(db).create_task(
            DeliveryTaskCreate(pickup_station_id="A", destination_station_id="C"),
            owner_id="admin",
        )
        service = EmergencyStopService(db)
        _, command, _ = service.activate("robot01")
        stale, matched = service.acknowledge(
            "robot01", "stale", "emergency_stop", True, None
        )
        assert not matched and stale.latched
        stopped, matched = service.acknowledge(
            "robot01", command["command_id"], "emergency_stop", True, None
        )
        assert matched and stopped.state.value == "STOPPED"
        _, reset_command = service.request_reset("robot01")
        reset, matched = service.acknowledge(
            "robot01",
            reset_command["command_id"],
            "emergency_stop_reset",
            True,
            None,
        )
        assert matched and not reset.latched and reset.state.value == "NORMAL"
        old_task = db.get(DeliveryTaskORM, task.id)
        assert old_task.status.value == "FAILED"
        assert DeliveryService(db).build_navigation_command(old_task) is None


def test_reset_ack_refreshes_state_cached_by_long_lived_websocket_session():
    with Session() as setup_db:
        service = EmergencyStopService(setup_db)
        _, stop_command, _ = service.activate("robot01")
        stopped, matched = service.acknowledge(
            "robot01",
            stop_command["command_id"],
            "emergency_stop",
            True,
            None,
        )
        assert matched and stopped.state.value == "STOPPED"

    with Session() as websocket_db:
        websocket_service = EmergencyStopService(websocket_db)
        cached = websocket_service.get("robot01")
        assert cached.state.value == "STOPPED"
        assert cached.pending_command_id is None

        with Session() as rest_db:
            _, reset_command = EmergencyStopService(rest_db).request_reset(
                "robot01"
            )

        reset_id = reset_command["command_id"]
        assert cached.state.value == "STOPPED"
        assert cached.pending_command_id is None

        stale, matched = websocket_service.acknowledge(
            "robot01",
            "genuinely-stale-command-id",
            "emergency_stop_reset",
            True,
            None,
        )
        assert not matched
        assert stale.state.value == "RESET_REQUESTED"
        assert stale.latched
        assert stale.pending_command_id == reset_id

        wrong_type, matched = websocket_service.acknowledge(
            "robot01",
            reset_id,
            "emergency_stop",
            True,
            None,
        )
        assert not matched
        assert wrong_type.state.value == "RESET_REQUESTED"
        assert wrong_type.latched
        assert wrong_type.pending_command_id == reset_id

        reset, matched = websocket_service.acknowledge(
            "robot01",
            reset_id,
            "emergency_stop_reset",
            True,
            None,
        )
        assert matched
        assert reset.state.value == "NORMAL"
        assert not reset.latched
        assert reset.pending_command_id is None
        assert reset.command_deadline is None
        assert reset.failure_detail is None


def test_rejected_ack_and_reset_timeout_remain_latched():
    with Session() as db:
        service = EmergencyStopService(db)
        _, stop_command, _ = service.activate("robot01")
        rejected, matched = service.acknowledge(
            "robot01",
            stop_command["command_id"],
            "emergency_stop",
            False,
            "Robot rejected command",
        )
        assert matched
        assert rejected.state.value == "FAILED"
        assert rejected.latched

        pending, _ = service.request_reset("robot01")
        pending.command_deadline = utc_now() - timedelta(seconds=1)
        db.commit()
        expired = service.get("robot01")
        assert expired.state.value == "FAILED"
        assert expired.latched
        assert expired.pending_command_id is not None
        assert expired.command_deadline is None
        assert expired.failure_detail == (
            "Emergency Stop command acknowledgement timed out"
        )


def test_robot_authentication_security_boundaries():
    assert robot_authorization_valid("", None, False)
    assert not robot_authorization_valid("", None, True)
    assert robot_authorization_valid("Bearer robot-secret", "robot-secret", True)
    assert not robot_authorization_valid("Bearer browser-session", "robot-secret", True)
    assert not robot_authorization_valid("robot-secret", "robot-secret", True)


class StubSocket:
    def __init__(self, cookies=None):
        self.cookies = cookies or {}
        self.sent = []
        self.accepted = False
        self.closed = None

    async def accept(self):
        self.accepted = True

    async def send_json(self, value):
        self.sent.append(value)

    async def receive_json(self):
        raise WebSocketDisconnect()

    async def close(self, code=1000, reason=""):
        self.closed = (code, reason)


def test_dashboard_websocket_session_boundary_without_testclient():
    with Session() as db:
        user = db.get(UserORM, "admin")
        token, _ = create_session(db, user)
        accepted = StubSocket({SESSION_COOKIE_NAME: token})
        asyncio.run(dashboard_websocket(accepted, db))
        assert accepted.accepted
        missing = StubSocket()
        asyncio.run(dashboard_websocket(missing, db))
        assert not missing.accepted and missing.closed[0] == 1008
