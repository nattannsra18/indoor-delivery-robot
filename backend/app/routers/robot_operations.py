from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import require_admin
from ..database import get_db
from ..db_models import UserORM
from ..models import (
    RobotOperation,
    RobotOperationAction,
    RobotOperationRequest,
    utc_now,
)
from ..robot_operation_store import robot_operation_store
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager

router = APIRouter(prefix="/api/robots", tags=["robot-operations"])


@router.get("/{robot_id}/operations/latest", response_model=RobotOperation | None)
def latest_operation(
    robot_id: str,
    db: Session = Depends(get_db, scope="function"),
    _: UserORM = Depends(require_admin),
) -> RobotOperation | None:
    DeliveryService(db).get_robot(robot_id)
    return robot_operation_store.latest(robot_id)


@router.post(
    "/{robot_id}/operations",
    response_model=RobotOperation,
    status_code=status.HTTP_202_ACCEPTED,
)
async def request_operation(
    robot_id: str,
    payload: RobotOperationRequest,
    db: Session = Depends(get_db, scope="function"),
    user: UserORM = Depends(require_admin),
) -> RobotOperation:
    service = DeliveryService(db)
    robot = service.get_robot(robot_id)
    if not robot.online:
        raise HTTPException(status_code=503, detail="Robot Agent is offline")
    if payload.action in {
        RobotOperationAction.STOP_ROBOT_STACK,
        RobotOperationAction.SHUTDOWN_ODROID,
    } and not payload.confirm:
        raise HTTPException(status_code=400, detail="Explicit confirmation is required")

    operation = robot_operation_store.begin(robot_id, payload.action)
    now = utc_now()
    command_payload: dict[str, object] = {}
    active_task = service.active_task_for_robot(robot_id)
    if payload.action == RobotOperationAction.RECOVER_NAVIGATION and active_task:
        navigation_command = service.build_navigation_command(active_task)
        if navigation_command is not None:
            command_payload["target"] = navigation_command["target"]
            command_payload["task_id"] = active_task.id

    envelope = {
        "type": "command",
        "protocol_version": "1.0",
        "command_id": operation.command_id,
        "robot_id": robot_id,
        "action": payload.action.value,
        "issued_at": now.isoformat(),
        "expires_at": (now + timedelta(seconds=60)).isoformat(),
        "expected_profile_version": robot.profile_version,
        "payload": command_payload,
    }
    AuditService(db).log(
        user.id,
        f"robot_operation.{payload.action.value}.requested",
        "robot",
        robot_id,
        {"command_id": operation.command_id},
    )
    db.commit()
    if not await robot_connection_manager.send_json(robot_id, envelope):
        robot_operation_store.mark_delivery_failed(
            operation.command_id,
            "Robot Agent is offline",
        )
        raise HTTPException(status_code=503, detail="Robot Agent is offline")
    return robot_operation_store.latest(robot_id) or operation
