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
from ..auth import require_admin, websocket_session
from ..database import get_db
from ..models import Alert, UserRole
from ..alert_service import AlertService
from ..emergency_service import EmergencyStopService
from sqlalchemy.orm import Session
from ..db_models import DeliveryTaskORM
from ..notification_service import NotificationService
from ..models import Notification

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
    resolved = websocket_session(websocket, db)
    if resolved is None:
        await websocket.close(code=1008, reason="Authentication required")
        return
    user, session = resolved
    await browser_connection_manager.connect(
        websocket,
        user.role,
        user.id,
        session.id,
    )

    await websocket.send_json(
        {
            "type": "dashboard_connection_ack",
            "connected": True,
            "server_time": current_utc_time(),
        }
    )

    notifications, unread_count, _ = NotificationService(db).list(user.id, 0, 30)
    await websocket.send_json(
        {
            "type": "notification_snapshot",
            "notifications": [Notification.model_validate(item).model_dump(mode="json") for item in notifications],
            "unread_count": unread_count,
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

    # Dashboard sockets are long-lived.  All initial reads are complete, so
    # release SQLite's implicit read transaction before waiting for frames.
    db.rollback()

    try:
        while True:
            message = await websocket.receive_json()

            # A cookie may have been revoked after this socket connected.
            # Re-check before replying so logout/session expiry does not keep
            # an authenticated dashboard transport alive indefinitely.
            try:
                still_authenticated = websocket_session(websocket, db)
            finally:
                # Session revalidation is a short read transaction. Never
                # retain it while awaiting the next WebSocket frame.
                db.rollback()
            if still_authenticated is None:
                browser_connection_manager.disconnect(websocket)
                await websocket.close(code=1008, reason="Authentication required")
                return

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
        db.rollback()

    except Exception:
        browser_connection_manager.disconnect(websocket)
        db.rollback()

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass

        raise
