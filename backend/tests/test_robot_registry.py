from __future__ import annotations

from datetime import timedelta
import asyncio

import pytest
from fastapi import HTTPException, WebSocketDisconnect
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import sessionmaker

from app.auth import token_digest, verify_password
from app.database import Base
from app.alert_service import AlertService
from app.db_models import RobotCredentialORM, RobotEnrollmentORM, RobotORM, StationORM, UserORM
from app.models import (
    DeliveryTaskCreate,
    RobotAgentHello,
    RobotAgentReadiness,
    RobotCommandAcknowledgement,
    RobotCommandEnvelope,
    RobotEnrollmentRequest,
    RobotEnrollmentStatus,
    RobotReadinessStatus,
    TaskStatus,
    UserRole,
    utc_now,
)
from app.robot_registry import RobotRegistryService
from app.routers.robot_ws import robot_websocket
from app.routers.robot_registry import revoke_robot
from app.schema import apply_compatibility_migrations
from app.service import DeliveryService
from app.websocket_manager import robot_connection_manager


def session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine, expire_on_commit=False)()
    db.add(UserORM(id="admin", username="admin", password_hash="unused", role=UserRole.ADMIN))
    db.commit()
    return db


def enrollment_payload() -> RobotEnrollmentRequest:
    return RobotEnrollmentRequest(
        serial_number="SIM-0001",
        hardware_fingerprint="sha256:fixture-fingerprint-0001",
        display_name="Simulation Robot",
        agent_version="0.5.0",
        ros_distro="jazzy",
        profile_version="turtlebot3-sim-v1",
        capabilities=["Mapping", "navigation", "mapping", "localization"],
    )


def test_pairing_claims_one_time_per_robot_credential_and_never_stores_plaintext():
    db = session()
    registry = RobotRegistryService(db)
    created = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    enrollment = db.get(RobotEnrollmentORM, created.enrollment_id)

    assert enrollment is not None
    assert verify_password(created.pairing_code, enrollment.pairing_code_hash)
    assert created.pairing_code not in enrollment.pairing_code_hash
    assert registry.list_enrollments()[0].capabilities == [
        "localization", "mapping", "navigation"
    ]
    assert registry.list_enrollments()[0].fingerprint_sha256 == token_digest(
        enrollment_payload().hardware_fingerprint
    )

    approved = registry.approve(created.enrollment_id, created.pairing_code, "admin")
    assert approved.status == RobotEnrollmentStatus.UNPAIRED

    claimed = registry.claim(
        created.enrollment_id,
        created.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )
    stored = db.scalar(
        select(RobotCredentialORM).where(RobotCredentialORM.robot_id == claimed.robot_id)
    )
    assert stored is not None
    assert stored.token_hash == token_digest(claimed.credential)
    assert claimed.credential not in stored.token_hash
    assert registry.authenticate(claimed.robot_id, claimed.credential) is not None
    assert registry.authenticate(claimed.robot_id, "wrong") is None

    with pytest.raises(HTTPException) as duplicate:
        registry.claim(
            created.enrollment_id,
            created.pairing_code,
            enrollment_payload().hardware_fingerprint,
        )
    assert duplicate.value.status_code == 409


def test_agent_hello_is_versioned_bound_to_identity_and_updates_observed_profile():
    db = session()
    registry = RobotRegistryService(db)
    created = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    registry.approve(created.enrollment_id, created.pairing_code, "admin")
    claimed = registry.claim(
        created.enrollment_id,
        created.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )
    robot = db.get(RobotORM, claimed.robot_id)

    hello = RobotAgentHello(
        type="agent_hello",
        protocol_version="1.0",
        robot_id=claimed.robot_id,
        boot_id="boot-1",
        agent_version="0.5.1",
        ros_distro="jazzy",
        profile_version="turtlebot3-sim-v2",
        capabilities=["Navigation", "mapping", "navigation"],
    )
    registry.apply_hello(robot, hello)
    entry = next(item for item in registry.list_registry() if item.id == claimed.robot_id)
    assert entry.capabilities == ["mapping", "navigation"]
    assert entry.last_boot_id == "boot-1"
    assert entry.readiness_status == RobotReadinessStatus.NOT_READY

    DeliveryService(db).record_robot_connection(claimed.robot_id, True)
    connected = next(
        item for item in registry.list_registry() if item.id == claimed.robot_id
    )
    assert connected.online is True

    DeliveryService(db).record_robot_connection(claimed.robot_id, False)
    disconnected = next(
        item for item in registry.list_registry() if item.id == claimed.robot_id
    )
    assert disconnected.online is False

    wrong = hello.model_copy(update={"robot_id": "another-robot"})
    with pytest.raises(HTTPException) as mismatch:
        registry.apply_hello(robot, wrong)
    assert mismatch.value.status_code == 403

    registry.apply_readiness(
        robot,
        RobotAgentReadiness(
            type="agent_readiness",
            protocol_version="1.0",
            robot_id=claimed.robot_id,
            status=RobotReadinessStatus.READY,
            checks={"nav2": True, "localization": True, "map": True},
            active_map_id="warehouse_map",
            timestamp=utc_now(),
        ),
    )
    ready = next(item for item in registry.list_registry() if item.id == claimed.robot_id)
    assert ready.readiness_status == RobotReadinessStatus.READY


def test_expired_pairing_code_and_revoked_credential_are_rejected():
    db = session()
    registry = RobotRegistryService(db)
    created = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    enrollment = db.get(RobotEnrollmentORM, created.enrollment_id)
    enrollment.expires_at = utc_now() - timedelta(seconds=1)
    db.commit()
    with pytest.raises(HTTPException) as expired:
        registry.approve(created.enrollment_id, created.pairing_code, "admin")
    assert expired.value.status_code == 410

    with pytest.raises(HTTPException) as expired_claim:
        registry.claim(
            created.enrollment_id,
            created.pairing_code,
            enrollment_payload().hardware_fingerprint,
        )
    assert expired_claim.value.status_code == 410

    fresh = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    registry.approve(fresh.enrollment_id, fresh.pairing_code, "admin")
    claimed = registry.claim(
        fresh.enrollment_id,
        fresh.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )
    registry.revoke(claimed.robot_id)
    assert registry.authenticate(claimed.robot_id, claimed.credential) is None
    entry = next(item for item in registry.list_registry() if item.id == claimed.robot_id)
    assert entry.enrollment_status == RobotEnrollmentStatus.REVOKED
    assert entry.credential_revoked is True

    replacement = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    registry.approve(replacement.enrollment_id, replacement.pairing_code, "admin")
    reclaimed = registry.claim(
        replacement.enrollment_id,
        replacement.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )
    assert reclaimed.robot_id == claimed.robot_id
    assert reclaimed.credential_version == 2
    assert registry.authenticate(reclaimed.robot_id, reclaimed.credential) is not None


def test_primary_robot_prefers_connected_ready_pair_over_legacy_seed():
    db = session()
    db.add(
        RobotORM(
            id="robot01",
            name="Legacy simulator",
            online=True,
        )
    )
    db.commit()
    registry = RobotRegistryService(db)
    created = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    registry.approve(created.enrollment_id, created.pairing_code, "admin")
    claimed = registry.claim(
        created.enrollment_id,
        created.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )
    paired = db.get(RobotORM, claimed.robot_id)
    registry.apply_readiness(
        paired,
        RobotAgentReadiness(
            type="agent_readiness",
            protocol_version="1.0",
            robot_id=claimed.robot_id,
            status=RobotReadinessStatus.READY,
            checks={"nav2": True},
            timestamp=utc_now(),
        ),
    )
    service = DeliveryService(db)
    service.record_robot_connection(claimed.robot_id, True)

    assert service.primary_robot().id == claimed.robot_id
    assert service.overview().robot.id == claimed.robot_id

    service.record_robot_connection(claimed.robot_id, False)
    assert service.primary_robot().id == claimed.robot_id


class StubSocket:
    def __init__(self, token: str, messages: list[dict]):
        self.headers = {"authorization": f"Bearer {token}"}
        self.messages = iter(messages)
        self.sent: list[dict] = []
        self.accepted = False
        self.closed: tuple[int, str] | None = None

    async def accept(self):
        self.accepted = True

    async def receive_json(self):
        try:
            return next(self.messages)
        except StopIteration as error:
            raise WebSocketDisconnect() from error

    async def send_json(self, value):
        self.sent.append(value)

    async def close(self, code=1000, reason=""):
        self.closed = (code, reason)


class QueueSocket:
    _disconnect = object()

    def __init__(self, token: str, hello: RobotAgentHello):
        self.headers = {"authorization": f"Bearer {token}"}
        self.incoming: asyncio.Queue = asyncio.Queue()
        self.incoming.put_nowait(hello.model_dump(mode="json"))
        self.sent: list[dict] = []
        self.accepted = False
        self.closed: tuple[int, str] | None = None
        self.changed = asyncio.Event()

    async def accept(self):
        self.accepted = True

    async def receive_json(self):
        message = await self.incoming.get()
        if message is self._disconnect:
            raise WebSocketDisconnect()
        return message

    async def send_json(self, value):
        self.sent.append(value)
        self.changed.set()

    async def close(self, code=1000, reason=""):
        self.closed = (code, reason)
        self.incoming.put_nowait(self._disconnect)

    def disconnect(self):
        self.incoming.put_nowait(self._disconnect)

    async def wait_for(self, message_type: str, timeout: float = 1.0) -> dict:
        async def find_message():
            while True:
                match = next(
                    (message for message in self.sent if message.get("type") == message_type),
                    None,
                )
                if match is not None:
                    return match
                self.changed.clear()
                await self.changed.wait()

        return await asyncio.wait_for(find_message(), timeout=timeout)


def paired_robot(db):
    registry = RobotRegistryService(db)
    created = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    registry.approve(created.enrollment_id, created.pairing_code, "admin")
    claimed = registry.claim(
        created.enrollment_id,
        created.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )
    return registry, claimed


def agent_hello(robot_id: str, boot_id: str) -> RobotAgentHello:
    return RobotAgentHello(
        type="agent_hello",
        protocol_version="1.0",
        robot_id=robot_id,
        boot_id=boot_id,
        agent_version="0.5.0",
        ros_distro="jazzy",
        profile_version="turtlebot3-sim-v1",
        capabilities=["navigation", "diagnostics"],
    )


def test_connection_manager_closes_active_socket_when_credential_is_revoked():
    socket = StubSocket("credential", [])

    async def scenario():
        await robot_connection_manager.connect("revoked-robot", socket)
        closed = await robot_connection_manager.close(
            "revoked-robot",
            reason="Robot credential revoked by administrator",
        )
        return closed

    assert asyncio.run(scenario()) is True
    assert socket.closed == (1008, "Robot credential revoked by administrator")
    assert robot_connection_manager.is_connected("revoked-robot") is False


def test_active_mission_survives_disconnect_alerts_and_resends_on_reconnect():
    async def scenario():
        db = session()
        db.add_all([
            StationORM(id="A", map_id="warehouse_map", name="A", x=0, y=0, yaw=0),
            StationORM(id="B", map_id="warehouse_map", name="B", x=1, y=0, yaw=0),
        ])
        db.commit()
        _, claimed = paired_robot(db)
        robot = db.get(RobotORM, claimed.robot_id)
        robot.readiness_status = RobotReadinessStatus.READY
        db.commit()

        first = QueueSocket(claimed.credential, agent_hello(claimed.robot_id, "boot-1"))
        first_run = asyncio.create_task(robot_websocket(first, claimed.robot_id, db))
        await first.wait_for("connection_ack")
        first.incoming.put_nowait(RobotAgentReadiness(
            type="agent_readiness",
            protocol_version="1.0",
            robot_id=claimed.robot_id,
            status=RobotReadinessStatus.READY,
            checks={"nav2": True, "localization": True, "map": True},
            active_map_id="warehouse_map",
            timestamp=utc_now(),
        ).model_dump(mode="json"))
        await first.wait_for("agent_readiness_ack")

        service = DeliveryService(db)
        task = service.create_task(
            DeliveryTaskCreate(pickup_station_id="A", destination_station_id="B"),
            owner_id="admin",
            robot_id=claimed.robot_id,
        )
        assert task.status == TaskStatus.GOING_TO_PICKUP

        first.disconnect()
        await asyncio.wait_for(first_run, timeout=1.0)
        db.expire_all()
        disconnected_robot = db.get(RobotORM, claimed.robot_id)
        disconnected_task = service.get_task(task.id)
        assert disconnected_robot.online is False
        assert disconnected_robot.current_task_id == task.id
        assert disconnected_task.status == TaskStatus.GOING_TO_PICKUP
        alert = AlertService(db).get_by_key(f"robot-offline:{claimed.robot_id}")
        assert alert is not None
        assert alert.active is True
        assert alert.severity.value == "CRITICAL"

        second = QueueSocket(claimed.credential, agent_hello(claimed.robot_id, "boot-2"))
        second_run = asyncio.create_task(robot_websocket(second, claimed.robot_id, db))
        await second.wait_for("connection_ack")
        resent = await second.wait_for("command")
        assert resent["command"] == "navigate_to_pose"
        assert resent["task_id"] == task.id
        assert resent["robot_id"] == claimed.robot_id
        assert resent["stage"] == "pickup"
        db.expire_all()
        assert db.get(RobotORM, claimed.robot_id).online is True
        assert AlertService(db).get_by_key(f"robot-offline:{claimed.robot_id}").active is False

        second.disconnect()
        await asyncio.wait_for(second_run, timeout=1.0)
        db.close()

    asyncio.run(scenario())


def test_admin_revoke_endpoint_closes_runtime_socket_immediately():
    async def scenario():
        db = session()
        registry, claimed = paired_robot(db)
        socket = QueueSocket(claimed.credential, agent_hello(claimed.robot_id, "boot-revoke"))
        websocket_run = asyncio.create_task(robot_websocket(socket, claimed.robot_id, db))
        await socket.wait_for("connection_ack")
        assert robot_connection_manager.is_connected(claimed.robot_id) is True

        result = await revoke_robot(
            claimed.robot_id,
            db.get(UserORM, "admin"),
            db,
        )

        assert result.enrollment_status == RobotEnrollmentStatus.REVOKED
        assert result.online is False
        assert socket.closed == (1008, "Robot credential revoked by administrator")
        assert robot_connection_manager.is_connected(claimed.robot_id) is False
        assert registry.authenticate(claimed.robot_id, claimed.credential) is None
        await asyncio.wait_for(websocket_run, timeout=1.0)
        db.close()

    asyncio.run(scenario())


def test_paired_websocket_rejects_shared_token_and_requires_protocol_hello(monkeypatch):
    monkeypatch.setenv("ROBOT_WS_TOKEN", "legacy-shared-token")
    monkeypatch.setenv("ROBOT_WS_AUTH_REQUIRED", "true")
    monkeypatch.setenv("ALLOW_LEGACY_ROBOT_TOKEN", "true")
    db = session()
    registry = RobotRegistryService(db)
    created = registry.create_enrollment(enrollment_payload(), ttl_seconds=600)
    registry.approve(created.enrollment_id, created.pairing_code, "admin")
    claimed = registry.claim(
        created.enrollment_id,
        created.pairing_code,
        enrollment_payload().hardware_fingerprint,
    )

    impersonation = StubSocket("legacy-shared-token", [])
    asyncio.run(robot_websocket(impersonation, claimed.robot_id, db))
    assert impersonation.accepted is False
    assert impersonation.closed == (1008, "Robot authentication failed")

    missing_hello = StubSocket(claimed.credential, [{"type": "heartbeat"}])
    asyncio.run(robot_websocket(missing_hello, claimed.robot_id, db))
    assert missing_hello.accepted is True
    assert missing_hello.sent[0]["code"] == "INVALID_AGENT_HELLO"

    hello = RobotAgentHello(
        type="agent_hello",
        protocol_version="1.0",
        robot_id=claimed.robot_id,
        boot_id="boot-test",
        agent_version="0.5.0",
        ros_distro="jazzy",
        profile_version="turtlebot3-sim-v1",
        capabilities=["navigation", "mapping"],
    )
    connected = StubSocket(claimed.credential, [hello.model_dump(mode="json")])
    asyncio.run(robot_websocket(connected, claimed.robot_id, db))
    assert connected.sent[0]["type"] == "connection_ack"
    assert connected.sent[0]["authentication"] == "robot_credential"
    assert connected.sent[0]["protocol_version"] == "1.0"
    assert robot_connection_manager.is_connected(claimed.robot_id) is False


def test_command_contract_requires_expiry_and_correlated_lifecycle():
    issued_at = utc_now()
    command = RobotCommandEnvelope(
        command_id="cmd-1",
        robot_id="robot-1",
        action="navigation.goto",
        issued_at=issued_at,
        expires_at=issued_at + timedelta(seconds=15),
        expected_map_revision=7,
        expected_profile_version="scuttle-v1",
        payload={"x": 1.0, "y": 2.0},
    )
    status_message = RobotCommandAcknowledgement(
        command_id=command.command_id,
        robot_id=command.robot_id,
        lifecycle="accepted",
        timestamp=utc_now(),
    )
    assert command.protocol_version == "1.0"
    assert status_message.command_id == command.command_id

    with pytest.raises(ValueError):
        RobotCommandEnvelope(
            command_id="expired",
            robot_id="robot-1",
            action="navigation.goto",
            issued_at=issued_at,
            expires_at=issued_at,
        )


def test_compatibility_migration_adds_registry_schema_to_existing_robot_table():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE robots (
                id VARCHAR(40) PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                online BOOLEAN NOT NULL,
                battery INTEGER NOT NULL,
                state VARCHAR(30) NOT NULL,
                x FLOAT NOT NULL,
                y FLOAT NOT NULL,
                yaw FLOAT NOT NULL,
                current_task_id VARCHAR(40),
                last_seen VARCHAR(100) NOT NULL
            )
        """))
        connection.execute(text("""
            INSERT INTO robots VALUES (
                'legacy-sim', 'Legacy Simulator', true, 100, 'IDLE',
                0, 0, 0, NULL, '2026-09-06T00:00:00+00:00'
            )
        """))
    apply_compatibility_migrations(engine)
    apply_compatibility_migrations(engine)
    table_names = inspect(engine).get_table_names()
    robot_columns = {column["name"] for column in inspect(engine).get_columns("robots")}
    assert "robot_enrollments" in table_names
    assert "robot_credentials" in table_names
    assert {"serial_number", "enrollment_status", "readiness_status", "capabilities_json"} <= robot_columns
    with engine.connect() as connection:
        legacy = connection.execute(text(
            "SELECT enrollment_status, readiness_status FROM robots WHERE id = 'legacy-sim'"
        )).one()
    assert legacy == ("UNPAIRED", "NOT_READY")
