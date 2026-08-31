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
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import (
    EventSource,
    MapMessage,
    NavigationResultMessage,
    RobotTelemetry,
    TaskEvent,
)
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager
from ..map_store import map_store

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
    robot_ids = (
        robot_connection_manager.connected_robot_ids()
    )

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

    # Resend the current navigation command when
    # the Robot Agent reconnects.
    active_task = service.active_task()

    if (
        active_task is not None
        and active_task.robot_id == robot_id
    ):
        pending_command = (
            service.build_navigation_command(
                active_task
            )
        )

        if pending_command is not None:
            await websocket.send_json(
                pending_command
            )

    try:
        while True:
            message = await websocket.receive_json()

            if not isinstance(message, dict):
                await send_error(
                    websocket,
                    "INVALID_MESSAGE",
                    (
                        "The WebSocket message must "
                        "be a JSON object"
                    ),
                )
                continue

            message_type = message.get("type")

            if message_type == "heartbeat":
                await websocket.send_json(
                    {
                        "type": "heartbeat_ack",
                        "robot_id": robot_id,
                        "received_timestamp": (
                            message.get("timestamp")
                        ),
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )

            elif message_type == "telemetry":
                telemetry_data = message.get("data")

                if not isinstance(
                    telemetry_data,
                    dict,
                ):
                    await send_error(
                        websocket,
                        "INVALID_TELEMETRY",
                        (
                            "Telemetry data must be "
                            "a JSON object"
                        ),
                    )
                    continue

                try:
                    telemetry = (
                        RobotTelemetry.model_validate(
                            telemetry_data
                        )
                    )
                except ValidationError as error:
                    details = "; ".join(
                        (
                            f"{'.'.join(map(str, item['loc']))}: "
                            f"{item['msg']}"
                        )
                        for item in error.errors(
                            include_url=False
                        )
                    )

                    await send_error(
                        websocket,
                        "INVALID_TELEMETRY",
                        details,
                    )
                    continue

                updated_robot = (
                    service.update_robot_telemetry(
                        robot_id,
                        telemetry,
                    )
                )

                await websocket.send_json(
                    {
                        "type": "telemetry_ack",
                        "robot_id": robot_id,
                        "accepted": True,
                        "data": {
                            "x": updated_robot.x,
                            "y": updated_robot.y,
                            "yaw": updated_robot.yaw,
                            "battery": (
                                updated_robot.battery
                            ),
                            "frame_id": (
                                telemetry.frame_id
                            ),
                            "timestamp": (
                                telemetry.timestamp
                            ),
                        },
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )

            elif message_type == "map":
                try:
                    map_message = (
                        MapMessage.model_validate(
                            message
                        )
                    )
                except ValidationError as error:
                    details = "; ".join(
                        (
                            f"{'.'.join(map(str, item['loc']))}: "
                            f"{item['msg']}"
                        )
                        for item in error.errors(
                            include_url=False
                        )
                    )

                    await send_error(
                        websocket,
                        "INVALID_MAP",
                        details,
                    )
                    continue

                snapshot = map_store.update(
                    map_message.data
                )

                await websocket.send_json(
                    {
                        "type": "map_ack",
                        "revision": snapshot.revision,
                        "width": snapshot.width,
                        "height": snapshot.height,
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )

            elif message_type == "navigation_result":
                try:
                    navigation = (
                        NavigationResultMessage.model_validate(
                            message
                        )
                    )
                except ValidationError as error:
                    details = "; ".join(
                        (
                            f"{'.'.join(map(str, item['loc']))}: "
                            f"{item['msg']}"
                        )
                        for item in error.errors(
                            include_url=False
                        )
                    )

                    await send_error(
                        websocket,
                        "INVALID_NAVIGATION_RESULT",
                        details,
                    )
                    continue

                expected_prefix = (
                    f"{navigation.task_id}:"
                    f"{navigation.stage}:"
                )

                if not navigation.command_id.startswith(
                    expected_prefix
                ):
                    await send_error(
                        websocket,
                        "COMMAND_TASK_MISMATCH",
                        (
                            "command_id does not match "
                            "task_id and stage"
                        ),
                    )
                    continue

                if navigation.status == "succeeded":
                    if navigation.stage == "pickup":
                        task_event = (
                            TaskEvent.ARRIVED_PICKUP
                        )
                    else:
                        task_event = (
                            TaskEvent.ARRIVED_DESTINATION
                        )
                else:
                    task_event = (
                        TaskEvent.NAVIGATION_FAILED
                    )

                try:
                    db.expire_all()

                    updated_task = (
                        service.apply_task_event(
                            navigation.task_id,
                            task_event,
                            EventSource.ROBOT_AGENT,
                            navigation.detail
                            or (
                                "Nav2 navigation "
                                f"{navigation.status}"
                            ),
                        )
                    )
                except HTTPException as error:
                    await send_error(
                        websocket,
                        "TASK_TRANSITION_REJECTED",
                        str(error.detail),
                    )
                    continue

                await websocket.send_json(
                    {
                        "type": (
                            "navigation_result_received"
                        ),
                        "robot_id": robot_id,
                        "command_id": (
                            navigation.command_id
                        ),
                        "task_id": navigation.task_id,
                        "stage": navigation.stage,
                        "navigation_status": (
                            navigation.status
                        ),
                        "task_status": (
                            updated_task.status.value
                        ),
                        "accepted": True,
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )
            elif message_type == "command_ack":
                command_id = message.get(
                    "command_id"
                )
                accepted = message.get("accepted")

                if (
                    not isinstance(command_id, str)
                    or not command_id
                    or not isinstance(accepted, bool)
                ):
                    await send_error(
                        websocket,
                        "INVALID_COMMAND_ACK",
                        (
                            "command_id must be a "
                            "non-empty string and "
                            "accepted must be boolean"
                        ),
                    )
                    continue

                await websocket.send_json(
                    {
                        "type": (
                            "command_ack_received"
                        ),
                        "robot_id": robot_id,
                        "command_id": command_id,
                        "accepted": accepted,
                        "detail": message.get(
                            "detail"
                        ),
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )

            else:
                await send_error(
                    websocket,
                    "UNSUPPORTED_MESSAGE_TYPE",
                    (
                        "Supported message types are "
                        "'heartbeat', 'telemetry', 'map', "
                        "'navigation_result' and "
                        "'command_ack'"
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