from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import require_admin
from ..database import get_db
from ..db_models import UserORM
from ..emergency_service import EmergencyStopService
from ..map_catalog_operation_store import map_catalog_operation_store
from ..map_catalog_store import map_catalog_store
from ..map_switch_store import map_switch_store
from ..mapping_store import ACTIVE_PHASES, mapping_store
from ..models import (
    MappingPhase,
    MappingSaveRequest,
    MappingSession,
    MappingStartRequest,
    MappingTeleopRequest,
    RobotState,
)
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager

router = APIRouter(prefix="/api/mapping", tags=["mapping"])


def _require_robot_ready(db: Session, robot_id: str) -> None:
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
            detail="Robot must be online, idle, clear of queued work, and not emergency-stopped",
        )
    if map_switch_store.has_pending(robot_id) or map_catalog_operation_store.has_pending(robot_id):
        raise HTTPException(status_code=409, detail="A map operation is already pending")


async def _deliver(robot_id: str, payload: dict) -> None:
    if not await robot_connection_manager.send_json(robot_id, payload):
        mapping_store.fail(robot_id, "Robot Agent is offline")
        raise HTTPException(status_code=503, detail="Robot Agent is offline")


@router.get("/status", response_model=MappingSession)
def get_mapping_status(
    robot_id: str = "robot01",
    _: UserORM = Depends(require_admin),
) -> MappingSession:
    return mapping_store.get(robot_id)


@router.post("/start", response_model=MappingSession, status_code=status.HTTP_202_ACCEPTED)
async def start_mapping(
    payload: MappingStartRequest,
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MappingSession:
    _require_robot_ready(db, payload.robot_id)
    started = mapping_store.start(payload.robot_id)
    if started is None:
        raise HTTPException(status_code=409, detail="A mapping session is already active")
    session, command_id = started
    AuditService(db).log(user.id, "mapping.start_requested", "robot", payload.robot_id, {"session_id": session.session_id})
    db.commit()
    await _deliver(payload.robot_id, {
        "type": "mapping_command", "action": "START", "command_id": command_id,
        "robot_id": payload.robot_id, "session_id": session.session_id,
    })
    return mapping_store.get(payload.robot_id)


def _require_phase(robot_id: str, allowed: set[MappingPhase]) -> MappingSession:
    session = mapping_store.get(robot_id)
    if session.phase not in allowed or session.session_id is None:
        raise HTTPException(status_code=409, detail="Mapping session is not in the required state")
    return session


@router.post("/stop", response_model=MappingSession, status_code=status.HTTP_202_ACCEPTED)
async def stop_mapping(robot_id: str = "robot01", _: UserORM = Depends(require_admin)) -> MappingSession:
    session = _require_phase(robot_id, {MappingPhase.MAPPING})
    _, command_id = mapping_store.request(robot_id, MappingPhase.STOPPING)
    await _deliver(robot_id, {"type": "mapping_command", "action": "STOP", "command_id": command_id, "robot_id": robot_id, "session_id": session.session_id})
    return mapping_store.get(robot_id)


@router.post("/save", response_model=MappingSession, status_code=status.HTTP_202_ACCEPTED)
async def save_mapping(
    payload: MappingSaveRequest,
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MappingSession:
    session = _require_phase(robot_id, {MappingPhase.REVIEW})
    catalog = map_catalog_store.get(robot_id, robot_online=True)
    if catalog and any(item.id == payload.map_id for item in catalog.maps):
        raise HTTPException(status_code=409, detail="Map ID already exists on the robot")
    _, command_id = mapping_store.request(robot_id, MappingPhase.SAVING)
    AuditService(db).log(user.id, "mapping.save_requested", "map", payload.map_id, {"robot_id": robot_id, "session_id": session.session_id})
    db.commit()
    await _deliver(robot_id, {
        "type": "mapping_command", "action": "SAVE", "command_id": command_id,
        "robot_id": robot_id, "session_id": session.session_id,
        "map_id": payload.map_id, "metadata": payload.model_dump(exclude={"map_id"}),
    })
    return mapping_store.get(robot_id)


@router.post("/discard", response_model=MappingSession, status_code=status.HTTP_202_ACCEPTED)
async def discard_mapping(robot_id: str = "robot01", _: UserORM = Depends(require_admin)) -> MappingSession:
    session = _require_phase(robot_id, set(ACTIVE_PHASES) - {MappingPhase.STARTING, MappingPhase.SAVING, MappingPhase.RESTORING})
    _, command_id = mapping_store.request(robot_id, MappingPhase.RESTORING)
    await _deliver(robot_id, {"type": "mapping_command", "action": "DISCARD", "command_id": command_id, "robot_id": robot_id, "session_id": session.session_id})
    return mapping_store.get(robot_id)


@router.post("/teleop", status_code=status.HTTP_202_ACCEPTED)
async def mapping_teleop(
    payload: MappingTeleopRequest,
    robot_id: str = "robot01",
    _: UserORM = Depends(require_admin),
) -> dict[str, bool]:
    session = _require_phase(robot_id, {MappingPhase.MAPPING})
    await _deliver(robot_id, {
        "type": "mapping_teleop", "robot_id": robot_id, "session_id": session.session_id,
        "linear_x": payload.linear_x, "angular_z": payload.angular_z,
    })
    return {"accepted": True}
