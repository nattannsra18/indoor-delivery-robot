from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import require_admin
from ..config import security_settings
from ..database import get_db
from ..db_models import UserORM
from ..domain_context import TrustedActor
from ..models import (
    RobotCredentialClaimed,
    RobotEnrollmentApproval,
    RobotEnrollmentClaim,
    RobotEnrollmentCreated,
    RobotEnrollmentRequest,
    RobotEnrollmentSummary,
    RobotRegistryEntry,
)
from ..robot_registry import RobotRegistryService, bearer_value

router = APIRouter(prefix="/api/robot-registry", tags=["robot-registry"])


def _require_bootstrap(authorization: str | None) -> None:
    settings = security_settings()
    if not settings.robot_enrollment_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Robot enrollment is disabled")
    supplied = bearer_value(authorization or "")
    if settings.robot_enrollment_token is None or supplied is None or not hmac.compare_digest(
        supplied, settings.robot_enrollment_token
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid robot enrollment credential")


@router.post("/enrollments", response_model=RobotEnrollmentCreated, status_code=status.HTTP_201_CREATED)
def create_enrollment(
    payload: RobotEnrollmentRequest,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _require_bootstrap(authorization)
    settings = security_settings()
    result = RobotRegistryService(db).create_enrollment(
        payload, ttl_seconds=settings.robot_enrollment_ttl_seconds
    )
    AuditService(db).log(
        None,
        "robot.enrollment_requested",
        "robot_enrollment",
        result.enrollment_id,
        result="success",
    )
    db.commit()
    return result


@router.get("/enrollments", response_model=list[RobotEnrollmentSummary])
def list_enrollments(
    _: UserORM = Depends(require_admin), db: Session = Depends(get_db)
):
    return RobotRegistryService(db).list_enrollments()


@router.post("/enrollments/{enrollment_id}/approve", response_model=RobotEnrollmentSummary)
def approve_enrollment(
    enrollment_id: str,
    payload: RobotEnrollmentApproval,
    user: UserORM = Depends(require_admin),
    db: Session = Depends(get_db),
):
    result = RobotRegistryService(db).approve(enrollment_id, payload.pairing_code, user.id)
    AuditService(db).log(
        TrustedActor.user(user),
        "robot.enrollment_approved",
        "robot_enrollment",
        enrollment_id,
    )
    db.commit()
    return result


@router.post("/enrollments/{enrollment_id}/claim", response_model=RobotCredentialClaimed)
def claim_enrollment(
    enrollment_id: str,
    payload: RobotEnrollmentClaim,
    db: Session = Depends(get_db),
):
    result = RobotRegistryService(db).claim(
        enrollment_id, payload.pairing_code, payload.hardware_fingerprint
    )
    AuditService(db).log(
        TrustedActor.robot(result.robot_id),
        "robot.enrollment_claimed",
        "robot",
        result.robot_id,
    )
    db.commit()
    return result


@router.get("/robots", response_model=list[RobotRegistryEntry])
def list_registry(_: UserORM = Depends(require_admin), db: Session = Depends(get_db)):
    return RobotRegistryService(db).list_registry()


@router.post("/robots/{robot_id}/revoke", response_model=RobotRegistryEntry)
def revoke_robot(
    robot_id: str,
    user: UserORM = Depends(require_admin),
    db: Session = Depends(get_db),
):
    result = RobotRegistryService(db).revoke(robot_id)
    AuditService(db).log(
        TrustedActor.user(user), "robot.credential_revoked", "robot", robot_id
    )
    db.commit()
    return result
