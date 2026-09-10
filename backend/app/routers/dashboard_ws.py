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
    user_id = user.id
    user_role = user.role
    session_id = session.id
    # Authentication is a database read. Release its transaction before the
    # first network await so this socket can never hold database resources
    # while a slow/disconnected browser is being accepted.
    db.rollback()
    await browser_connection_manager.connect(
        websocket,
        user_role,
        user_id,
        session_id,
    )

    await websocket.send_json(
        {
            "type": "dashboard_connection_ack",
            "connected": True,
            "server_time": current_utc_time(),
        }
    )

    notifications, unread_count, _ = NotificationService(db).list(user_id, 0, 30)
    notification_payload = [
        Notification.model_validate(item).model_dump(mode="json")
        for item in notifications
    ]
    db.rollback()
    await websocket.send_json(
        {
            "type": "notification_snapshot",
            "notifications": notification_payload,
            "unread_count": unread_count,
            "server_time": current_utc_time(),
        }
    )

    path_payloads: list[dict[str, Any]] = []
    for robot_id, path in navigation_path_store.all_paths():
        task = db.get(DeliveryTaskORM, path.task_id)
        if user_role != UserRole.ADMIN and (task is None or task.owner_id != user_id):
            continue
        path_payloads.append(
            {
                "type": "navigation_path",
                "robot_id": robot_id,
                **path.model_dump(exclude={"type"}),
                "server_time": current_utc_time(),
            }
        )
    db.rollback()
    for payload in path_payloads:
        await websocket.send_json(
            payload
        )

    if user_role == UserRole.ADMIN:
        alert_payload = [
            Alert.model_validate(item).model_dump(mode="json")
            for item in AlertService(db).list(active_only=True)
        ]
        db.rollback()
        emergency_stop_payload = [
            item.model_dump(mode="json")
            for item in EmergencyStopService(db).list_states()
        ]
        # list_states commits lazily-created defaults. Keep this explicit
        # rollback as a guard if its implementation changes later.
        db.rollback()
        await websocket.send_json(
            {
                "type": "alert_snapshot",
                "alerts": alert_payload,
                "server_time": current_utc_time(),
            }
        )
        await websocket.send_json(
            {
                "type": "emergency_stop_snapshot",
                "emergency_stops": emergency_stop_payload,
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
