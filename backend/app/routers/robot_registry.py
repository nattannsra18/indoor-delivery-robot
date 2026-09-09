from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
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
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager
from ..rate_limit import robot_enrollment_limiter

router = APIRouter(prefix="/api/robot-registry", tags=["robot-registry"])


def _rate_limit_enrollment(request: Request, action: str) -> None:
    settings = security_settings()
    client = request.client.host if request.client is not None else "unknown"
    retry_after = robot_enrollment_limiter.check(
        f"{action}:{client}",
        limit=settings.robot_enrollment_rate_limit,
        window_seconds=settings.robot_enrollment_rate_window_seconds,
    )
    if retry_after is not None:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            "Too many robot enrollment attempts",
            headers={"Retry-After": str(retry_after)},
        )


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
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    _rate_limit_enrollment(request, "create")
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
    request: Request,
    db: Session = Depends(get_db),
):
    _rate_limit_enrollment(request, "claim")
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
async def revoke_robot(
    robot_id: str,
    user: UserORM = Depends(require_admin),
    db: Session = Depends(get_db),
):
    registry = RobotRegistryService(db)
    registry.revoke(robot_id)
    AuditService(db).log(
        TrustedActor.user(user), "robot.credential_revoked", "robot", robot_id
    )
    db.commit()
    disconnected = await robot_connection_manager.close(
        robot_id,
        reason="Robot credential revoked by administrator",
    )
    if disconnected:
        DeliveryService(db).record_robot_connection(robot_id, False)
    return next(item for item in registry.list_registry() if item.id == robot_id)


@router.post("/robots/{robot_id}/rotate", response_model=RobotRegistryEntry)
async def rotate_robot_credential(
    robot_id: str,
    user: UserORM = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if not robot_connection_manager.is_connected(robot_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Robot must be connected to rotate its credential",
        )
    registry = RobotRegistryService(db)
    replacement = registry.prepare_rotation(robot_id)
    AuditService(db).log(
        TrustedActor.user(user),
        "robot.credential_rotation_requested",
        "robot",
        robot_id,
        {"robot_id": robot_id, "credential_version": replacement.credential_version},
    )
    db.commit()
    sent = await robot_connection_manager.send_json(
        robot_id,
        {
            "type": "credential_rotation",
            "protocol_version": "1.0",
            "robot_id": robot_id,
            "credential": replacement.credential,
            "credential_version": replacement.credential_version,
        },
    )
    if not sent:
        registry.cancel_rotation(robot_id, replacement.credential_version)
        AuditService(db).log(
            TrustedActor.user(user),
            "robot.credential_rotation_failed",
            "robot",
            robot_id,
            {"robot_id": robot_id, "credential_version": replacement.credential_version},
            result="failed",
        )
        db.commit()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Robot disconnected before the new credential could be delivered",
        )
    return next(item for item in registry.list_registry() if item.id == robot_id)
