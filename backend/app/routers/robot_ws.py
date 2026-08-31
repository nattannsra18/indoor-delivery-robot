from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from sqlalchemy.orm import Session

from ..database import get_db
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager

router = APIRouter(tags=["robot-websocket"])


def current_utc_time() -> str:
    return datetime.now(timezone.utc).isoformat()


async def send_error(
    websocket: WebSocket,
    code: str,
    detail: str,
) -> None:
    await websocket.send_json(
        {
            "type": "error",
            "code": code,
            "detail": detail,
            "server_time": current_utc_time(),
        }
    )


@router.get("/api/robot-connections")
def list_robot_connections() -> dict[str, Any]:
    robot_ids = robot_connection_manager.connected_robot_ids()

    return {
        "count": len(robot_ids),
        "connected_robot_ids": robot_ids,
    }


@router.websocket("/ws/robots/{robot_id}")
async def robot_websocket(
    websocket: WebSocket,
    robot_id: str,
    db: Session = Depends(get_db),
) -> None:
    service = DeliveryService(db)

    try:
        robot = service.get_robot(robot_id)
    except HTTPException:
        await websocket.close(
            code=1008,
            reason="Robot does not exist",
        )
        return

    await robot_connection_manager.connect(
        robot_id,
        websocket,
    )

    await websocket.send_json(
        {
            "type": "connection_ack",
            "robot_id": robot.id,
            "robot_name": robot.name,
            "connected": True,
            "server_time": current_utc_time(),
        }
    )

    try:
        while True:
            message = await websocket.receive_json()

            if not isinstance(message, dict):
                await send_error(
                    websocket,
                    "INVALID_MESSAGE",
                    "The WebSocket message must be a JSON object",
                )
                continue

            message_type = message.get("type")

            if message_type == "heartbeat":
                await websocket.send_json(
                    {
                        "type": "heartbeat_ack",
                        "robot_id": robot_id,
                        "received_timestamp": message.get(
                            "timestamp"
                        ),
                        "server_time": current_utc_time(),
                    }
                )

            elif message_type == "telemetry":
                telemetry = message.get("data")

                if not isinstance(telemetry, dict):
                    await send_error(
                        websocket,
                        "INVALID_TELEMETRY",
                        "Telemetry data must be a JSON object",
                    )
                    continue

                # Transport verification only.
                # Database persistence will be added in the next step.
                await websocket.send_json(
                    {
                        "type": "telemetry_ack",
                        "robot_id": robot_id,
                        "accepted": True,
                        "server_time": current_utc_time(),
                    }
                )

            else:
                await send_error(
                    websocket,
                    "UNSUPPORTED_MESSAGE_TYPE",
                    (
                        "Supported message types are "
                        "'heartbeat' and 'telemetry'"
                    ),
                )

    except WebSocketDisconnect:
        robot_connection_manager.disconnect(
            robot_id,
            websocket,
        )

    except Exception:
        robot_connection_manager.disconnect(
            robot_id,
            websocket,
        )

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass

        raise
