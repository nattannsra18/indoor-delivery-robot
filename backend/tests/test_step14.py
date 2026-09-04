"""Focused Step 14 persistence tests; each uses an isolated SQLite database."""
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import sessionmaker

from app.audit_service import AuditService
from app.auth import hash_password
from app.database import Base
from app.db_models import AuditRecordORM, NotificationORM, RobotORM, UserORM
from app.models import EmergencyStopState, RobotState, UserRole
from app.notification_service import NotificationService
from app.schema import apply_compatibility_migrations
from app.browser_websocket_manager import BrowserConnectionManager
from app import notification_delivery
from app.routers import dashboard_ws
from app.emergency_service import EmergencyStopService
from app.websocket_manager import RobotConnectionManager
from app.domain_context import TrustedActor
from fastapi import WebSocketDisconnect
import asyncio


def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, expire_on_commit=False)
    db = factory()
    db.add_all([
        UserORM(id="alice", username="alice", password_hash=hash_password("a", iterations=1000), role=UserRole.USER),
        UserORM(id="bob", username="bob", password_hash=hash_password("b", iterations=1000), role=UserRole.USER),
    ])
    db.commit()
    return db


def test_notification_deduplicates_and_ownership_queries_are_scoped():
    db = session(); notifications = NotificationService(db)
    first = notifications.create("alice", "task.create", "Created", "Task TASK-1", "task:TASK-1:create", "task", "TASK-1")
    duplicate = notifications.create("alice", "task.create", "Created", "Task TASK-1", "task:TASK-1:create", "task", "TASK-1")
    notifications.create("bob", "task.create", "Created", "Task TASK-2", "task:TASK-2:create", "task", "TASK-2")
    db.commit()
    assert first.id == duplicate.id
    items, unread, _ = notifications.list("alice", 0, 100)
    assert [item.id for item in items] == [first.id] and unread == 1
    assert notifications.mark_read("bob", first.id) is None
    assert notifications.mark_read("alice", first.id).read_at is not None
    notifications.mark_all_read("alice")
    assert db.scalar(select(NotificationORM).where(NotificationORM.recipient_id == "bob", NotificationORM.read_at.is_(None))) is not None


def test_audit_metadata_is_allowlisted_and_append_only():
    db = session(); record = AuditService(db).log("alice", "task.create", "task", "TASK-1", {
        "priority": "HIGH", "delivery_note": "private", "authorization": "Bearer secret", "password": "secret",
    })
    db.commit()
    stored = db.get(AuditRecordORM, record.id)
    assert stored.metadata_json == '{"priority": "HIGH"}'
    assert not hasattr(AuditService, "delete") and not hasattr(AuditService, "update")


def test_audit_actor_types_preserve_user_robot_and_system_identity():
    db = session()
    user = AuditService(db).log("alice", "task.created", "task", "TASK-1")
    robot = AuditService(db).log(
        TrustedActor.robot("robot01"), "task.arrived_pickup", "task", "TASK-1"
    )
    system = AuditService(db).log(None, "task.dispatched", "task", "TASK-1")
    db.commit()
    assert (user.actor_type, user.actor_id, user.actor_identifier) == ("USER", "alice", "alice")
    assert (robot.actor_type, robot.actor_id, robot.actor_identifier) == ("ROBOT", None, "robot01")
    assert (system.actor_type, system.actor_id, system.actor_identifier) == ("SYSTEM", None, None)


def test_logout_is_idempotent_and_audits_only_a_valid_session(monkeypatch):
    from fastapi import Response
    from starlette.requests import Request
    from app.auth import SESSION_COOKIE_NAME, create_session
    from app.routers.auth import logout

    db = session()
    token, record = create_session(db, db.get(UserORM, "alice"))
    request = Request({"type": "http", "headers": [(b"cookie", f"{SESSION_COOKIE_NAME}={token}".encode())]})
    response = logout(request, Response(), db)
    assert response.status_code == 204
    assert "idr_session=\"\"" in response.headers["set-cookie"]
    assert db.get(type(record), record.id).revoked_at is not None
    audit = db.scalar(select(AuditRecordORM).where(AuditRecordORM.action == "auth.logout"))
    assert (audit.actor_type, audit.actor_id) == ("USER", "alice")

    absent = Request({"type": "http", "headers": []})
    again = logout(absent, Response(), db)
    assert again.status_code == 204
    assert db.scalars(select(AuditRecordORM).where(AuditRecordORM.action == "auth.logout")).all() == [audit]


def test_dashboard_notification_targeting_uses_registered_identity_only():
    class Socket:
        def __init__(self): self.messages = []
        async def accept(self): pass
        async def send_json(self, value): self.messages.append(value)
    async def run():
        manager = BrowserConnectionManager(); alice = Socket(); bob = Socket(); admin = Socket()
        await manager.connect(alice, UserRole.USER, "alice", "session-a")
        await manager.connect(bob, UserRole.USER, "bob", "session-b")
        await manager.connect(admin, UserRole.ADMIN, "admin", "session-admin")
        await manager.publish_notification({"type": "notification_created", "notification": {"id": "n1"}}, "alice")
        assert len(alice.messages) == 1 and not bob.messages and not admin.messages
        manager.clear()
    asyncio.run(run())


def test_compatibility_migration_adds_step14_tables_without_losing_legacy_task():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.tables["users"].create(engine)
    with engine.begin() as connection:
        connection.execute(text("CREATE TABLE delivery_tasks (id VARCHAR(40) PRIMARY KEY, pickup_station_id VARCHAR(20), destination_station_id VARCHAR(20), status VARCHAR(40), created_at DATETIME, progress INTEGER)"))
        connection.execute(text("INSERT INTO delivery_tasks VALUES ('TASK-OLD', 'A', 'C', 'QUEUED', CURRENT_TIMESTAMP, 0)"))
    apply_compatibility_migrations(engine)
    apply_compatibility_migrations(engine)
    inspector = inspect(engine)
    assert {"notifications", "audit_records"}.issubset(inspector.get_table_names())
    assert {"recipient_id", "deduplication_key", "read_at"}.issubset({item["name"] for item in inspector.get_columns("notifications")})
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT id FROM delivery_tasks")) == "TASK-OLD"
    assert {"actor_type", "actor_identifier"}.issubset(
        {item["name"] for item in inspect(engine).get_columns("audit_records")}
    )


def test_admin_operational_notification_is_not_personal_user_broadcast():
    db = session()
    db.add(UserORM(id="admin", username="admin", password_hash=hash_password("p", iterations=1000), role=UserRole.ADMIN)); db.commit()
    items = NotificationService(db).create_for_admins("alert.created", "Alert", "Operational", "alert:a1", "alert", "a1")
    db.commit()
    assert [item.recipient_id for item in items] == ["admin"]
    alice, _, _ = NotificationService(db).list("alice", 0, 10)
    admin, _, _ = NotificationService(db).list("admin", 0, 10)
    assert not alice and len(admin) == 1


def test_uncommitted_notification_is_removed_by_domain_transaction_rollback():
    db = session()
    item = NotificationService(db).create("alice", "task.created", "Created", "Task TASK-ROLLBACK", "task:TASK-ROLLBACK:created")
    assert item is not None
    db.rollback()
    db.expire_all()
    assert db.get(NotificationORM, item.id) is None


def test_post_commit_notification_delivery_is_targeted_and_has_stable_identity(monkeypatch):
    class Socket:
        def __init__(self):
            self.messages = []

        async def accept(self):
            pass

        async def send_json(self, value):
            self.messages.append(value)

    async def exercise():
        db = session()
        manager = BrowserConnectionManager()
        alice, bob, admin = Socket(), Socket(), Socket()
        await manager.connect(alice, UserRole.USER, "alice", "session-a")
        await manager.connect(bob, UserRole.USER, "bob", "session-b")
        await manager.connect(admin, UserRole.ADMIN, "admin", "session-admin")
        monkeypatch.setattr(notification_delivery, "browser_connection_manager", manager)

        item = NotificationService(db).create(
            "alice", "task.created", "Created", "Task TASK-1",
            "task:TASK-1:created", "task", "TASK-1",
        )
        # Creating/flushing a row never emits.  The explicit publisher is a
        # post-commit boundary, so a pending or rolled-back transaction cannot
        # leak a private event.
        assert not alice.messages and not bob.messages and not admin.messages
        db.commit()

        notification_delivery.publish_committed_notifications(db, [item.id])
        await manager.drain_scheduled_notifications()
        assert len(alice.messages) == 1
        assert not bob.messages and not admin.messages
        event = alice.messages[0]
        assert event["type"] == "notification_created"
        assert event["notification"]["id"] == item.id
        assert "deduplication_key" not in event["notification"]
        assert "recipient_id" not in event["notification"]
        manager.clear()

    asyncio.run(exercise())


def test_delivery_service_consumes_committed_notification_ids_once(monkeypatch):
    """A long-lived robot service cannot replay an earlier live notification."""
    from app.service import DeliveryService

    class Socket:
        def __init__(self):
            self.messages = []

        async def accept(self):
            pass

        async def send_json(self, value):
            self.messages.append(value)

    async def exercise():
        db = session()
        service = DeliveryService(db)
        manager = BrowserConnectionManager()
        socket = Socket()
        await manager.connect(socket, UserRole.USER, "alice", "session-a")
        monkeypatch.setattr(notification_delivery, "browser_connection_manager", manager)
        first = NotificationService(db).create(
            "alice", "task.created", "Created", "Task TASK-ONCE",
            "task:TASK-ONCE:created", "task", "TASK-ONCE",
        )
        second = NotificationService(db).create(
            "alice", "task.dispatched", "Dispatched", "Task TASK-ONCE",
            "task:TASK-ONCE:dispatched", "task", "TASK-ONCE",
        )
        db.commit()
        service.pending_notification_ids.extend([first.id, second.id, first.id])

        notification_delivery.publish_committed_notifications(
            db, service.take_pending_notification_ids()
        )
        notification_delivery.publish_committed_notifications(
            db, service.take_pending_notification_ids()
        )
        await manager.drain_scheduled_notifications()

        emitted_ids = [
            message["notification"]["id"]
            for message in socket.messages
            if message.get("type") == "notification_created"
        ]
        assert emitted_ids == [first.id, second.id]
        assert len(emitted_ids) == len(set(emitted_ids))
        manager.clear()

    asyncio.run(exercise())


def test_rollback_produces_no_live_event(monkeypatch):
    class Socket:
        def __init__(self):
            self.messages = []

        async def accept(self):
            pass

        async def send_json(self, value):
            self.messages.append(value)

    async def exercise():
        db = session()
        manager = BrowserConnectionManager()
        socket = Socket()
        await manager.connect(socket, UserRole.USER, "alice", "session-a")
        monkeypatch.setattr(notification_delivery, "browser_connection_manager", manager)
        item = NotificationService(db).create(
            "alice", "task.cancelled", "Cancelled", "Task TASK-2",
            "task:TASK-2:cancelled",
        )
        db.rollback()
        notification_delivery.publish_committed_notifications(db, [item.id])
        await manager.drain_scheduled_notifications()
        assert socket.messages == []
        manager.clear()

    asyncio.run(exercise())


def test_delivery_failure_does_not_rollback_persisted_notification(monkeypatch):
    class FailingSocket:
        async def accept(self):
            pass

        async def send_json(self, value):
            raise RuntimeError("transport failed")

    async def exercise():
        db = session()
        manager = BrowserConnectionManager()
        socket = FailingSocket()
        await manager.connect(socket, UserRole.USER, "alice", "session-a")
        monkeypatch.setattr(notification_delivery, "browser_connection_manager", manager)
        item = NotificationService(db).create(
            "alice", "task.completed", "Completed", "Task TASK-3",
            "task:TASK-3:completed",
        )
        db.commit()
        notification_delivery.publish_committed_notifications(db, [item.id])
        await manager.drain_scheduled_notifications()
        listed, unread, _ = NotificationService(db).list("alice", 0, 10)
        assert [entry.id for entry in listed] == [item.id]
        assert unread == 1
        assert manager.connection_count() == 0
        manager.clear()

    asyncio.run(exercise())


def test_reconnect_and_duplicate_delivery_do_not_create_duplicate_rows(monkeypatch):
    class Socket:
        def __init__(self):
            self.messages = []

        async def accept(self):
            pass

        async def send_json(self, value):
            self.messages.append(value)

    async def exercise():
        db = session()
        manager = BrowserConnectionManager()
        first, second = Socket(), Socket()
        await manager.connect(first, UserRole.USER, "alice", "old-session")
        monkeypatch.setattr(notification_delivery, "browser_connection_manager", manager)
        notifications = NotificationService(db)
        item = notifications.create("alice", "task.retry", "Retried", "Task TASK-4", "task:TASK-4:retry")
        duplicate = notifications.create("alice", "task.retry", "Retried", "Task TASK-4", "task:TASK-4:retry")
        db.commit()
        assert item.id == duplicate.id
        notification_delivery.publish_committed_notifications(db, [item.id])
        await manager.drain_scheduled_notifications()
        manager.disconnect_session("old-session")
        await manager.connect(second, UserRole.USER, "alice", "new-session")
        # Replaying a post-commit send is permitted for transport recovery,
        # but must not create another persistent row.
        notification_delivery.publish_committed_notifications(db, [item.id])
        await manager.drain_scheduled_notifications()
        assert first.messages and second.messages
        assert db.scalar(select(func.count()).select_from(NotificationORM)) == 1
        manager.clear()

    from sqlalchemy import func
    asyncio.run(exercise())


def test_revoked_dashboard_session_is_removed_from_private_delivery():
    class Socket:
        async def accept(self):
            pass

        async def send_json(self, value):
            raise AssertionError("revoked session received a private event")

    async def exercise():
        manager = BrowserConnectionManager()
        socket = Socket()
        await manager.connect(socket, UserRole.USER, "alice", "session-revoked")
        manager.disconnect_session("session-revoked")
        await manager.publish_notification({"type": "notification_created"}, "alice")
        assert manager.connection_count() == 0

    asyncio.run(exercise())


def test_dashboard_websocket_rejects_missing_session_without_registration(monkeypatch):
    class Socket:
        cookies = {}

        def __init__(self):
            self.accepted = False
            self.closed = None

        async def accept(self):
            self.accepted = True

        async def close(self, code=1000, reason=""):
            self.closed = (code, reason)

    async def exercise():
        manager = BrowserConnectionManager()
        monkeypatch.setattr(dashboard_ws, "browser_connection_manager", manager)
        socket = Socket()
        await dashboard_ws.dashboard_websocket(socket, session())
        assert not socket.accepted
        assert socket.closed == (1008, "Authentication required")
        assert manager.connection_count() == 0

    asyncio.run(exercise())


def test_forged_dashboard_identity_message_cannot_change_notification_target(monkeypatch):
    class Socket:
        def __init__(self, token):
            self.cookies = {"idr_session": token}
            self.sent = []
            self.accepted = False
            self.closed = None
            self._identity_rejected = asyncio.Event()
            self._disconnect = asyncio.Event()
            self._messages = iter([
                {"type": "identify", "user_id": "bob", "role": "ADMIN"},
            ])

        async def accept(self):
            self.accepted = True

        async def send_json(self, value):
            self.sent.append(value)
            if value.get("type") == "error":
                self._identity_rejected.set()

        async def receive_json(self):
            try:
                return next(self._messages)
            except StopIteration:
                await self._disconnect.wait()
                raise WebSocketDisconnect()

        async def close(self, code=1000, reason=""):
            self.closed = (code, reason)

    async def exercise():
        db = session()
        from app.auth import create_session
        alice = db.get(UserORM, "alice")
        token, _ = create_session(db, alice)
        manager = BrowserConnectionManager()
        monkeypatch.setattr(dashboard_ws, "browser_connection_manager", manager)
        monkeypatch.setattr(notification_delivery, "browser_connection_manager", manager)
        socket = Socket(token)
        handler = asyncio.create_task(dashboard_ws.dashboard_websocket(socket, db))
        await socket._identity_rejected.wait()

        item = NotificationService(db).create(
            "alice", "task.created", "Created", "Task TASK-5",
            "task:TASK-5:created",
        )
        db.commit()
        notification_delivery.publish_committed_notifications(db, [item.id])
        await manager.drain_scheduled_notifications()
        live = [message for message in socket.sent if message.get("type") == "notification_created"]
        assert len(live) == 1
        assert live[0]["notification"]["id"] == item.id
        assert all(message.get("type") != "notification_created" for message in socket.sent if message is not live[0])
        assert any(message.get("code") == "UNSUPPORTED_MESSAGE" for message in socket.sent)
        socket._disconnect.set()
        await handler
        manager.clear()

    asyncio.run(exercise())


def test_dashboard_socket_closes_after_its_session_is_revoked(monkeypatch):
    class Socket:
        def __init__(self, token):
            self.cookies = {"idr_session": token}
            self.sent = []
            self.closed = None
            self.waiting = asyncio.Event()
            self.continue_message = asyncio.Event()

        async def accept(self):
            pass

        async def send_json(self, value):
            self.sent.append(value)

        async def receive_json(self):
            self.waiting.set()
            await self.continue_message.wait()
            return {"type": "ping"}

        async def close(self, code=1000, reason=""):
            self.closed = (code, reason)

    async def exercise():
        from app.auth import create_session, revoke_session

        db = session()
        token, _ = create_session(db, db.get(UserORM, "alice"))
        manager = BrowserConnectionManager()
        monkeypatch.setattr(dashboard_ws, "browser_connection_manager", manager)
        socket = Socket(token)
        handler = asyncio.create_task(dashboard_ws.dashboard_websocket(socket, db))
        await socket.waiting.wait()
        assert revoke_session(db, token) is not None
        socket.continue_message.set()
        await handler
        assert socket.closed == (1008, "Authentication required")
        assert manager.connection_count() == 0
        manager.clear()

    asyncio.run(exercise())


def test_dashboard_ping_revalidation_releases_transaction_before_next_frame(monkeypatch):
    class Socket:
        def __init__(self, token):
            self.cookies = {"idr_session": token}
            self.sent = []
            self.closed = None
            self.waiting = asyncio.Event()
            self.messages: asyncio.Queue[dict] = asyncio.Queue()

        async def accept(self):
            pass

        async def send_json(self, value):
            self.sent.append(value)

        async def receive_json(self):
            self.waiting.set()
            return await self.messages.get()

        async def close(self, code=1000, reason=""):
            self.closed = (code, reason)

    async def exercise():
        from app.auth import create_session

        db = session()
        token, _ = create_session(db, db.get(UserORM, "alice"))
        manager = BrowserConnectionManager()
        monkeypatch.setattr(dashboard_ws, "browser_connection_manager", manager)
        socket = Socket(token)
        handler = asyncio.create_task(dashboard_ws.dashboard_websocket(socket, db))
        await socket.waiting.wait()
        socket.waiting.clear()
        await socket.messages.put({"type": "ping"})
        await socket.waiting.wait()
        assert any(message.get("type") == "pong" for message in socket.sent)
        assert not db.in_transaction()

        writer = sessionmaker(bind=db.get_bind(), expire_on_commit=False)()
        AuditService(writer).log(None, "task.dispatched", "task", "TASK-WRITE")
        writer.commit()
        writer.close()

        from app.auth import revoke_session
        assert revoke_session(db, token) is not None
        socket.messages.put_nowait({"type": "ping"})
        await handler
        assert socket.closed == (1008, "Authentication required")
        manager.clear()

    asyncio.run(exercise())


def test_emergency_command_outcome_is_persisted_with_alert_and_notification():
    db = session()
    db.add_all([
        UserORM(
            id="admin",
            username="admin",
            password_hash=hash_password("admin", iterations=1000),
            role=UserRole.ADMIN,
        ),
        RobotORM(
            id="robot01",
            name="Robot 01",
            online=True,
            state=RobotState.IDLE,
        ),
    ])
    db.commit()
    service = EmergencyStopService(db)
    state, command, created = service.activate("robot01", actor_id="admin")
    assert created and state.state == EmergencyStopState.STOP_REQUESTED
    assert command["command"] == "emergency_stop"
    assert db.scalar(
        select(AuditRecordORM).where(
            AuditRecordORM.action == "emergency.activate_requested"
        )
    ) is not None
    assert db.scalar(
        select(NotificationORM).where(
            NotificationORM.recipient_id == "admin",
            NotificationORM.event_type == "emergency.activate_requested",
        )
    ) is not None

    state, matched = service.acknowledge(
        "robot01",
        command["command_id"],
        "emergency_stop",
        True,
        None,
    )
    assert matched and state.state == EmergencyStopState.STOPPED
    assert db.scalar(
        select(AuditRecordORM).where(
            AuditRecordORM.action == "emergency.activate_succeeded"
        )
    ) is not None
    assert db.scalar(
        select(NotificationORM).where(
            NotificationORM.recipient_id == "admin",
            NotificationORM.event_type == "emergency.activate_succeeded",
        )
    ) is not None


def test_notification_and_audit_pagination_are_deterministic_and_bounded():
    db = session()
    notifications = NotificationService(db)
    for index in range(4):
        notifications.create(
            "alice", "task.created", f"Task {index}", "Created",
            f"task:TASK-{index}:created",
        )
        AuditService(db).log(
            "alice",
            "task.created" if index % 2 == 0 else "task.retry",
            "task",
            f"TASK-{index}",
        )
    db.commit()
    first, unread, next_offset = notifications.list("alice", 0, 2)
    second, _, _ = notifications.list("alice", next_offset or 0, 2)
    assert len(first) == len(second) == 2
    assert unread == 4
    assert not {item.id for item in first}.intersection(item.id for item in second)
    records, audit_next = AuditService(db).list(0, 1, "task.created")
    assert len(records) == 1 and audit_next == 1
    assert all(record.action == "task.created" for record in records)


def test_robot_connection_replacement_and_disconnect_are_identity_safe():
    from anyio import ClosedResourceError

    class Socket:
        def __init__(self, closed=False):
            self.closed = closed
            self.accepted = False

        async def accept(self):
            self.accepted = True

        async def close(self, **_kwargs):
            if self.closed:
                raise ClosedResourceError
            self.closed = True

    async def exercise():
        manager = RobotConnectionManager()
        old = Socket(closed=True)
        newer = Socket()
        await manager.connect("robot01", old)
        await manager.connect("robot01", newer)
        assert newer.accepted and manager.is_connected("robot01")
        assert not manager.disconnect("robot01", old)
        assert manager.is_connected("robot01")
        assert manager.disconnect("robot01", newer)
        assert not manager.is_connected("robot01")

    asyncio.run(exercise())
