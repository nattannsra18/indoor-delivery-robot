from __future__ import annotations

import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .auth import hash_password, token_digest, verify_password
from .db_models import RobotCredentialORM, RobotEnrollmentORM, RobotORM
from .models import (
    BatterySource,
    RobotAgentHello,
    RobotAgentReadiness,
    RobotCredentialClaimed,
    RobotEnrollmentCreated,
    RobotEnrollmentRequest,
    RobotEnrollmentStatus,
    RobotEnrollmentSummary,
    RobotReadinessStatus,
    RobotRegistryEntry,
    RobotState,
    utc_now,
)


def _aware(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def _capabilities(raw: str) -> list[str]:
    try:
        value = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return []
    return [item for item in value if isinstance(item, str)] if isinstance(value, list) else []


def _validation_results(raw: str | None) -> list[dict]:
    try:
        value = json.loads(raw or "[]")
    except (TypeError, json.JSONDecodeError):
        return []
    return value if isinstance(value, list) else []


def enrollment_summary(item: RobotEnrollmentORM) -> RobotEnrollmentSummary:
    return RobotEnrollmentSummary(
        id=item.id,
        serial_number=item.serial_number,
        fingerprint_sha256=item.hardware_fingerprint_hash,
        display_name=item.display_name,
        agent_version=item.agent_version,
        ros_distro=item.ros_distro,
        profile_version=item.profile_version,
        capabilities=_capabilities(item.capabilities_json),
        status=item.status,
        expires_at=item.expires_at,
        created_at=item.created_at,
        approved_at=item.approved_at,
        claimed_at=item.claimed_at,
        robot_id=item.robot_id,
    )


class RobotRegistryService:
    """Owns enrollment, pairing and per-robot credential lifecycle."""

    def __init__(self, db: Session):
        self.db = db

    def create_enrollment(
        self,
        payload: RobotEnrollmentRequest,
        *,
        ttl_seconds: int,
    ) -> RobotEnrollmentCreated:
        now = utc_now()
        fingerprint_hash = token_digest(payload.hardware_fingerprint)
        existing_robot = self.db.scalar(
            select(RobotORM).where(RobotORM.serial_number == payload.serial_number)
        )
        if existing_robot is not None and existing_robot.enrollment_status == RobotEnrollmentStatus.PAIRED:
            raise HTTPException(status.HTTP_409_CONFLICT, "Robot serial number is already paired")

        previous = list(
            self.db.scalars(
                select(RobotEnrollmentORM).where(
                    RobotEnrollmentORM.status == RobotEnrollmentStatus.PENDING,
                    (
                        (RobotEnrollmentORM.serial_number == payload.serial_number)
                        | (RobotEnrollmentORM.hardware_fingerprint_hash == fingerprint_hash)
                    ),
                )
            ).all()
        )
        for item in previous:
            item.status = RobotEnrollmentStatus.REVOKED

        pairing_code = "".join(secrets.choice("0123456789") for _ in range(8))
        enrollment = RobotEnrollmentORM(
            id=str(uuid4()),
            serial_number=payload.serial_number,
            hardware_fingerprint_hash=fingerprint_hash,
            display_name=payload.display_name,
            agent_version=payload.agent_version,
            ros_distro=payload.ros_distro,
            profile_version=payload.profile_version,
            capabilities_json=json.dumps(payload.capabilities, separators=(",", ":")),
            pairing_code_hash=hash_password(pairing_code),
            status=RobotEnrollmentStatus.PENDING,
            expires_at=now + timedelta(seconds=ttl_seconds),
            created_at=now,
        )
        self.db.add(enrollment)
        self.db.flush()
        return RobotEnrollmentCreated(
            enrollment_id=enrollment.id,
            pairing_code=pairing_code,
            expires_at=enrollment.expires_at,
        )

    def list_enrollments(self) -> list[RobotEnrollmentSummary]:
        items = self.db.scalars(
            select(RobotEnrollmentORM).order_by(RobotEnrollmentORM.created_at.desc())
        ).all()
        return [enrollment_summary(item) for item in items]

    def approve(self, enrollment_id: str, pairing_code: str, user_id: str) -> RobotEnrollmentSummary:
        item = self._enrollment(enrollment_id)
        self._validate_pairing(item, pairing_code)
        if item.status != RobotEnrollmentStatus.PENDING:
            raise HTTPException(status.HTTP_409_CONFLICT, "Enrollment is not pending")
        item.status = RobotEnrollmentStatus.UNPAIRED
        item.approved_at = utc_now()
        item.approved_by_user_id = user_id
        self.db.flush()
        self.db.refresh(item)
        return enrollment_summary(item)

    def claim(
        self,
        enrollment_id: str,
        pairing_code: str,
        hardware_fingerprint: str,
    ) -> RobotCredentialClaimed:
        item = self._enrollment(enrollment_id)
        if _aware(item.expires_at) <= utc_now():
            raise HTTPException(status.HTTP_410_GONE, "Pairing code expired")
        if item.status == RobotEnrollmentStatus.PENDING:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                "Enrollment is awaiting approval",
            )
        self._validate_pairing(item, pairing_code)
        if not hmac.compare_digest(
            item.hardware_fingerprint_hash, token_digest(hardware_fingerprint)
        ):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Hardware fingerprint mismatch")
        if item.status != RobotEnrollmentStatus.UNPAIRED or item.approved_at is None:
            raise HTTPException(status.HTTP_409_CONFLICT, "Enrollment is not approved")

        robot = self.db.scalar(
            select(RobotORM).where(RobotORM.serial_number == item.serial_number)
        )
        if robot is None:
            robot = RobotORM(
                id=str(uuid4()),
                name=item.display_name,
                serial_number=item.serial_number,
                online=False,
                battery=0,
                battery_source=BatterySource.UNAVAILABLE,
                state=RobotState.OFFLINE,
                last_seen=utc_now().isoformat(),
            )
            self.db.add(robot)
        robot_id = robot.id
        robot.name = item.display_name
        robot.enrollment_status = RobotEnrollmentStatus.PAIRED
        robot.readiness_status = RobotReadinessStatus.NOT_READY
        robot.active_map_id = None
        robot.profile_version = item.profile_version
        robot.agent_version = item.agent_version
        robot.ros_distro = item.ros_distro
        robot.capabilities_json = item.capabilities_json
        latest_version = self.db.scalar(
            select(RobotCredentialORM.version)
            .where(RobotCredentialORM.robot_id == robot_id)
            .order_by(RobotCredentialORM.version.desc())
            .limit(1)
        ) or 0
        credential_value = secrets.token_urlsafe(48)
        credential = RobotCredentialORM(
            id=str(uuid4()),
            robot_id=robot_id,
            token_hash=token_digest(credential_value),
            version=latest_version + 1,
        )
        self.db.add(credential)
        self.db.flush()
        item.robot_id = robot_id
        item.claimed_at = utc_now()
        item.status = RobotEnrollmentStatus.PAIRED
        self.db.flush()
        return RobotCredentialClaimed(
            robot_id=robot_id,
            credential=credential_value,
            credential_version=credential.version,
        )

    def authenticate(self, robot_id: str, credential_value: str) -> RobotCredentialORM | None:
        item = self.db.scalar(
            select(RobotCredentialORM).where(
                RobotCredentialORM.robot_id == robot_id,
                RobotCredentialORM.token_hash == token_digest(credential_value),
                RobotCredentialORM.revoked_at.is_(None),
            )
        )
        if item is None:
            return None
        if item.expires_at is not None and _aware(item.expires_at) <= utc_now():
            return None
        item.last_used_at = utc_now()
        self.db.commit()
        return item

    def has_active_credentials(self, robot_id: str) -> bool:
        return self.db.scalar(
            select(RobotCredentialORM.id).where(
                RobotCredentialORM.robot_id == robot_id,
                RobotCredentialORM.revoked_at.is_(None),
            ).limit(1)
        ) is not None

    def apply_hello(self, robot: RobotORM, hello: RobotAgentHello) -> None:
        if hello.robot_id != robot.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "agent_hello robot_id mismatch")
        robot.last_boot_id = hello.boot_id
        robot.agent_version = hello.agent_version
        robot.ros_distro = hello.ros_distro
        robot.profile_version = hello.profile_version
        robot.capabilities_json = json.dumps(hello.capabilities, separators=(",", ":"))
        robot.enrollment_status = RobotEnrollmentStatus.PAIRED
        robot.readiness_status = RobotReadinessStatus.NOT_READY
        robot.readiness_detail = "Waiting for a fresh Agent readiness report"
        robot.readiness_checks_json = "[]"
        robot.readiness_updated_at = None
        robot.active_map_id = None
        self.db.commit()

    def apply_readiness(self, robot: RobotORM, readiness: RobotAgentReadiness) -> None:
        if readiness.robot_id != robot.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "agent_readiness robot_id mismatch")
        if robot.enrollment_status != RobotEnrollmentStatus.PAIRED:
            raise HTTPException(status.HTTP_409_CONFLICT, "Robot is not paired")
        robot.readiness_status = readiness.status
        robot.readiness_detail = readiness.detail
        robot.readiness_updated_at = readiness.timestamp
        robot.active_map_id = readiness.active_map_id
        robot.readiness_checks_json = json.dumps(
            [item.model_dump(mode="json") for item in readiness.validation_results],
            separators=(",", ":"),
        )
        self.db.commit()

    def list_registry(self) -> list[RobotRegistryEntry]:
        robots = self.db.scalars(select(RobotORM).order_by(RobotORM.name, RobotORM.id)).all()
        result: list[RobotRegistryEntry] = []
        for robot in robots:
            credential = self.db.scalar(
                select(RobotCredentialORM)
                .where(RobotCredentialORM.robot_id == robot.id)
                .order_by(RobotCredentialORM.version.desc())
                .limit(1)
            )
            result.append(
                RobotRegistryEntry(
                    id=robot.id,
                    display_name=robot.name,
                    serial_number=robot.serial_number,
                    enrollment_status=robot.enrollment_status,
                    readiness_status=robot.readiness_status,
                    online=robot.online,
                    profile_version=robot.profile_version,
                    agent_version=robot.agent_version,
                    ros_distro=robot.ros_distro,
                    capabilities=_capabilities(robot.capabilities_json),
                    last_boot_id=robot.last_boot_id,
                    credential_version=credential.version if credential else None,
                    credential_revoked=bool(credential and credential.revoked_at),
                    readiness_detail=robot.readiness_detail,
                    readiness_updated_at=robot.readiness_updated_at,
                    validation_results=_validation_results(robot.readiness_checks_json),
                )
            )
        return result

    def revoke(self, robot_id: str) -> RobotRegistryEntry:
        robot = self.db.get(RobotORM, robot_id)
        if robot is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Robot not found")
        now = utc_now()
        credentials = self.db.scalars(
            select(RobotCredentialORM).where(
                RobotCredentialORM.robot_id == robot_id,
                RobotCredentialORM.revoked_at.is_(None),
            )
        ).all()
        for credential in credentials:
            credential.revoked_at = now
        robot.enrollment_status = RobotEnrollmentStatus.REVOKED
        robot.readiness_status = RobotReadinessStatus.NOT_READY
        robot.active_map_id = None
        robot.online = False
        robot.state = RobotState.OFFLINE
        self.db.flush()
        return next(item for item in self.list_registry() if item.id == robot_id)

    def _enrollment(self, enrollment_id: str) -> RobotEnrollmentORM:
        item = self.db.get(RobotEnrollmentORM, enrollment_id)
        if item is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Enrollment not found")
        return item

    @staticmethod
    def _validate_pairing(item: RobotEnrollmentORM, pairing_code: str) -> None:
        if _aware(item.expires_at) <= utc_now():
            raise HTTPException(status.HTTP_410_GONE, "Pairing code expired")
        if not verify_password(pairing_code, item.pairing_code_hash):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Pairing code is invalid")


def bearer_value(authorization: str) -> str | None:
    scheme, separator, value = authorization.partition(" ")
    if not separator or scheme.casefold() != "bearer" or not value.strip():
        return None
    return value.strip()
