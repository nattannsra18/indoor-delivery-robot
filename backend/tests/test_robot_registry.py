from __future__ import annotations

from datetime import timedelta
import asyncio

import pytest
from fastapi import HTTPException, WebSocketDisconnect
from sqlalchemy import create_engine, inspect, select, text
from sqlalchemy.orm import sessionmaker

from app.auth import token_digest, verify_password
from app.database import Base
from app.db_models import RobotCredentialORM, RobotEnrollmentORM, RobotORM, UserORM
from app.models import (
    RobotAgentHello,
    RobotAgentReadiness,
    RobotCommandAcknowledgement,
    RobotCommandEnvelope,
    RobotEnrollmentRequest,
    RobotEnrollmentStatus,
    RobotReadinessStatus,
    UserRole,
    utc_now,
)
from app.robot_registry import RobotRegistryService
from app.routers.robot_ws import robot_websocket
from app.schema import apply_compatibility_migrations
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
