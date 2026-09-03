from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..alert_service import AlertService
from ..auth import require_admin, require_user
from ..browser_websocket_manager import browser_connection_manager
from ..database import get_db
from ..db_models import UserORM
from ..emergency_service import EmergencyStopService
from ..models import Alert, EmergencyStop
from ..websocket_manager import robot_connection_manager

router = APIRouter(prefix="/api/robots", tags=["emergency-stop"])


async def broadcast_state(state: EmergencyStop) -> None:
    await browser_connection_manager.broadcast_json(
        {"type": "emergency_stop_changed", "emergency_stop": state.model_dump(mode="json")}
    )


async def broadcast_alert(db: Session, key: str, event: str) -> None:
    alert = AlertService(db).get_by_key(key)
    if alert is not None:
        await browser_connection_manager.broadcast_json(
            {
                "type": "alert_changed",
                "event": event,
                "alert": Alert.model_validate(alert).model_dump(mode="json"),
            },
            admin_only=True,
        )


@router.get("/{robot_id}/emergency-stop", response_model=EmergencyStop)
def get_state(robot_id: str, db: Session = Depends(get_db), _: UserORM = Depends(require_user)):
    return EmergencyStopService(db).get(robot_id)


@router.post("/{robot_id}/emergency-stop", response_model=EmergencyStop)
async def activate(robot_id: str, db: Session = Depends(get_db), _: UserORM = Depends(require_admin)):
    service = EmergencyStopService(db)
    state, command, created = service.activate(robot_id)
    if created:
        await broadcast_alert(db, f"emergency-stop:{robot_id}", "created")
    delivered = await robot_connection_manager.send_json(robot_id, command)
    if not delivered:
        state = service.mark_delivery_failed(robot_id, str(command["command_id"]), "Robot is offline; stop remains latched")
        await broadcast_alert(
            db, f"emergency-command-failure:{robot_id}", "created"
        )
    await broadcast_state(EmergencyStop.model_validate(state))
    return state


@router.post("/{robot_id}/emergency-stop/reset", response_model=EmergencyStop)
async def reset(robot_id: str, db: Session = Depends(get_db), _: UserORM = Depends(require_admin)):
    service = EmergencyStopService(db)
    state, command = service.request_reset(robot_id)
    delivered = await robot_connection_manager.send_json(robot_id, command)
    if not delivered:
        state = service.mark_delivery_failed(robot_id, str(command["command_id"]), "Robot is offline; reset was not acknowledged")
        await broadcast_alert(
            db, f"emergency-command-failure:{robot_id}", "created"
        )
    await broadcast_state(EmergencyStop.model_validate(state))
    return state
