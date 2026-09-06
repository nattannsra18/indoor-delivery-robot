from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import require_admin
from ..database import get_db
from ..db_models import UserORM
from ..emergency_service import EmergencyStopService
from ..localization_store import localization_store
from ..map_catalog_operation_store import map_catalog_operation_store
from ..map_switch_store import map_switch_store
from ..mapping_store import mapping_store
from ..models import (
    LocalizationCommandAction,
    LocalizationCommandRequest,
    LocalizationInitialPoseRequest,
    LocalizationStatus,
    LocalizationTeleopRequest,
    RobotState,
)
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager

router = APIRouter(prefix="/api/localization", tags=["localization"])


def _require_localization_ready(db: Session, robot_id: str) -> None:
    service = DeliveryService(db)
    robot = service.get_robot(robot_id)
    if (
        not robot.online
        or robot.state != RobotState.IDLE
        or robot.current_task_id is not None
        or service.active_task_for_robot(robot_id) is not None
        or service.repo.queued_tasks()
        or EmergencyStopService(db).is_latched(robot_id)
    ):
        raise HTTPException(
            status_code=409,
            detail=(
                "Robot must be online, idle, clear of queued work, "
                "and not emergency-stopped"
            ),
        )
    if (
        mapping_store.is_active(robot_id)
        or map_switch_store.has_pending(robot_id)
        or map_catalog_operation_store.has_pending(robot_id)
    ):
        raise HTTPException(
            status_code=409,
            detail="A map or mapping operation is already active",
        )
    if localization_store.has_pending(robot_id):
        raise HTTPException(
            status_code=409,
            detail="A localization command is already pending",
        )


async def _send_command(
    db: Session,
    user: UserORM,
    robot_id: str,
    action: LocalizationCommandAction,
    payload: dict,
) -> LocalizationStatus:
    _require_localization_ready(db, robot_id)
    requested = localization_store.request(robot_id, action)
    if requested is None:
        raise HTTPException(status_code=409, detail="A localization command is already pending")
    current, command_id = requested
    AuditService(db).log(
        user.id,
        f"localization.{action.value.lower()}_requested",
        "robot",
        robot_id,
        {"command_id": command_id, **payload},
    )
    db.commit()
    delivered = await robot_connection_manager.send_json(robot_id, {
        "type": "localization_command",
        "robot_id": robot_id,
        "command_id": command_id,
        "action": action.value,
        **payload,
    })
    if not delivered:
        localization_store.fail_delivery(robot_id, command_id, "Robot Agent is offline")
        raise HTTPException(status_code=503, detail="Robot Agent is offline")
    return current


@router.get("/status", response_model=LocalizationStatus)
def get_localization_status(
    robot_id: str = "robot01",
    _: UserORM = Depends(require_admin),
) -> LocalizationStatus:
    return localization_store.get(robot_id)


@router.post(
    "/initial-pose",
    response_model=LocalizationStatus,
    status_code=status.HTTP_202_ACCEPTED,
)
async def set_initial_pose(
    payload: LocalizationInitialPoseRequest,
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> LocalizationStatus:
    return await _send_command(
        db,
        user,
        payload.robot_id,
        LocalizationCommandAction.SET_INITIAL_POSE,
        {
            "pose": payload.pose.model_dump(),
            "position_uncertainty": payload.position_uncertainty,
            "yaw_uncertainty": payload.yaw_uncertainty,
        },
    )


@router.post(
    "/relocalize",
    response_model=LocalizationStatus,
    status_code=status.HTTP_202_ACCEPTED,
)
async def global_localization(
    payload: LocalizationCommandRequest,
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> LocalizationStatus:
    return await _send_command(
        db,
        user,
        payload.robot_id,
        LocalizationCommandAction.GLOBAL_LOCALIZATION,
        {},
    )


@router.post("/recovery/teleop", status_code=status.HTTP_202_ACCEPTED)
async def localization_recovery_teleop(
    payload: LocalizationTeleopRequest,
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    _: UserORM = Depends(require_admin),
) -> dict[str, bool]:
    _require_localization_ready(db, robot_id)
    current = localization_store.get(robot_id)
    if not current.recovery_active:
        raise HTTPException(
            status_code=409,
            detail="Global relocalization recovery is not active",
        )
    delivered = await robot_connection_manager.send_json(robot_id, {
        "type": "localization_teleop",
        "robot_id": robot_id,
        "linear_x": payload.linear_x,
        "angular_z": payload.angular_z,
    })
    if not delivered:
        raise HTTPException(status_code=503, detail="Robot Agent is offline")
    return {"accepted": True}


async def _localization_scan_command(
    robot_id: str,
    action: str,
    db: Session,
    user: UserORM,
) -> dict[str, bool]:
    current = localization_store.get(robot_id)
    if action == "START":
        _require_localization_ready(db, robot_id)
        if not current.recovery_active:
            raise HTTPException(
                status_code=409,
                detail="Global relocalization recovery is not active",
            )
    delivered = await robot_connection_manager.send_json(robot_id, {
        "type": "localization_scan",
        "robot_id": robot_id,
        "action": action,
    })
    if not delivered:
        raise HTTPException(status_code=503, detail="Robot Agent is offline")
    AuditService(db).log(
        user.id,
        f"localization.automatic_scan_{action.lower()}",
        "robot",
        robot_id,
    )
    db.commit()
    return {"accepted": True}


@router.post("/recovery/scan/start", status_code=status.HTTP_202_ACCEPTED)
async def start_localization_scan(
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> dict[str, bool]:
    return await _localization_scan_command(robot_id, "START", db, user)


@router.post("/recovery/scan/stop", status_code=status.HTTP_202_ACCEPTED)
async def stop_localization_scan(
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> dict[str, bool]:
    return await _localization_scan_command(robot_id, "STOP", db, user)
