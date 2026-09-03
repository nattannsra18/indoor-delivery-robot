from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
)

from ..browser_websocket_manager import (
    browser_connection_manager,
)
from ..navigation_path_store import navigation_path_store
from ..auth import require_admin, websocket_user
from ..database import get_db
from ..models import Alert, UserRole
from ..alert_service import AlertService
from ..emergency_service import EmergencyStopService
from sqlalchemy.orm import Session
from ..db_models import DeliveryTaskORM

router = APIRouter(tags=["dashboard-websocket"])


def current_utc_time() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/api/dashboard-connections", dependencies=[Depends(require_admin)])
def list_dashboard_connections() -> dict[str, Any]:
    return {
        "count": (
            browser_connection_manager.connection_count()
        ),
    }


@router.websocket("/ws/dashboard")
async def dashboard_websocket(
    websocket: WebSocket,
    db: Session = Depends(get_db),
) -> None:
    user = websocket_user(websocket, db)
    if user is None:
        await websocket.close(code=1008, reason="Authentication required")
        return
    await browser_connection_manager.connect(websocket, user.role, user.id)

    await websocket.send_json(
        {
            "type": "dashboard_connection_ack",
            "connected": True,
            "server_time": current_utc_time(),
        }
    )

    for robot_id, path in navigation_path_store.all_paths():
        task = db.get(DeliveryTaskORM, path.task_id)
        if user.role != UserRole.ADMIN and (task is None or task.owner_id != user.id):
            continue
        await websocket.send_json(
            {
                "type": "navigation_path",
                "robot_id": robot_id,
                **path.model_dump(exclude={"type"}),
                "server_time": current_utc_time(),
            }
        )

    if user.role == UserRole.ADMIN:
        await websocket.send_json(
            {
                "type": "alert_snapshot",
                "alerts": [
                    Alert.model_validate(item).model_dump(mode="json")
                    for item in AlertService(db).list(active_only=True)
                ],
                "server_time": current_utc_time(),
            }
        )
        await websocket.send_json(
            {
                "type": "emergency_stop_snapshot",
                "emergency_stops": [
                    item.model_dump(mode="json")
                    for item in EmergencyStopService(db).list_states()
                ],
                "server_time": current_utc_time(),
            }
        )

    try:
        while True:
            message = await websocket.receive_json()

            if (
                isinstance(message, dict)
                and message.get("type") == "ping"
            ):
                await websocket.send_json(
                    {
                        "type": "pong",
                        "server_time": current_utc_time(),
                    }
                )
            else:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "UNSUPPORTED_MESSAGE",
                        "detail": (
                            "The dashboard WebSocket "
                            "currently supports only ping"
                        ),
                        "server_time": current_utc_time(),
                    }
                )

    except WebSocketDisconnect:
        browser_connection_manager.disconnect(websocket)

    except Exception:
        browser_connection_manager.disconnect(websocket)

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass

        raise
