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
from ..browser_websocket_manager import (
    browser_connection_manager,
)
from ..database import get_db
from ..models import (
    DiagnosticsMessage,
    EventSource,
    MapMessage,
    RobotMapCatalogMessage,
    RobotMapCatalogOperationResultMessage,
    RobotMapSwitchResultMessage,
    RobotMappingStatusMessage,
    NavigationFeedbackMessage,
    NavigationPathClearMessage,
    NavigationPathMessage,
    NavigationResultMessage,
    RoutePreviewResultMessage,
    RobotTelemetry,
    TaskEvent,
)
from ..service import DeliveryService
from ..websocket_manager import robot_connection_manager
from ..map_store import map_store
from ..map_catalog_store import map_catalog_store
from ..map_switch_store import map_switch_store
from ..map_catalog_operation_store import map_catalog_operation_store
from ..mapping_store import mapping_store
from ..audit_service import AuditService
from ..navigation_path_store import navigation_path_store
from ..alert_service import AlertService
from ..config import security_settings
from ..emergency_service import EmergencyStopService
from ..models import Alert, AlertSeverity, EmergencyStop
from ..auth import require_admin, robot_authorization_valid
from ..navigation_feedback_store import (
    LatestNavigationEstimate,
    navigation_feedback_store,
)
from ..route_preview import route_preview_coordinator
from ..notification_delivery import publish_committed_notifications
from ..domain_context import TrustedActor

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


def navigation_association_error(
    service: DeliveryService,
    robot_id: str,
    command_id: str,
    task_id: str,
    stage: str,
) -> tuple[str, str] | None:
    current_robot = service.get_robot(robot_id)
    if current_robot.current_task_id != task_id:
        return (
            "PATH_TASK_MISMATCH",
            "task_id is not the robot's current task",
        )

    task = service.get_task(task_id)
    if task.robot_id != robot_id:
        return (
            "PATH_ROBOT_MISMATCH",
            "task is not assigned to this robot",
        )

    expected_stage = {
        "GOING_TO_PICKUP": "pickup",
        "DELIVERING": "destination",
    }.get(task.status.value)
    if expected_stage != stage:
        return (
            "PATH_STAGE_MISMATCH",
            "stage does not match the active workflow state",
        )

    if not navigation_path_store.matches(
        robot_id,
        command_id,
        task_id,
        stage,
    ):
        return (
            "PATH_COMMAND_MISMATCH",
            "command_id is not the active navigation command",
        )

    return None


async def broadcast_path_clear(
    robot_id: str,
    reason: str,
    *,
    remove_command: bool = True,
) -> None:
    command = (
        navigation_path_store.clear(robot_id)
        if remove_command
        else navigation_path_store.clear_path(robot_id)
    )
    if command is None:
        return

    await browser_connection_manager.broadcast_json(
        {
            "type": "navigation_path_clear",
            "robot_id": robot_id,
            "command_id": command.command_id,
            "task_id": command.task_id,
            "stage": command.stage,
            "reason": reason,
            "server_time": current_utc_time(),
        }
    )


@router.get("/api/robot-connections", dependencies=[Depends(require_admin)])
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
    settings = security_settings()
    authorization = websocket.headers.get("authorization", "")
    if not robot_authorization_valid(
        authorization,
        settings.robot_ws_token,
        settings.robot_ws_auth_required,
    ):
        await websocket.close(code=1008, reason="Robot authentication failed")
        return

    # Clear any transaction inherited from dependency setup before loading the
    # robot.  The long-lived receive loop is released separately below.
    db.rollback()

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
    publish_committed_notifications(
        db, service.record_robot_connection(robot_id, True)
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

    offline_alerts = AlertService(db)
    offline_alert = offline_alerts.resolve_key(f"robot-offline:{robot_id}")
    publish_committed_notifications(
        db,
        offline_alerts.pending_notification_ids,
    )
    if offline_alert is not None:
        await browser_connection_manager.broadcast_json(
            {"type": "alert_changed", "event": "resolved", "alert": Alert.model_validate(offline_alert).model_dump(mode="json")},
            admin_only=True,
        )

    emergency_command = EmergencyStopService(db).reconnect_command(robot_id)
    if emergency_command is not None:
        await websocket.send_json(emergency_command)

    # A cancellation request has priority over
    # resending an active navigation command.
    pending_cancel = (
        service.pending_navigation_cancel(
            robot_id
        )
    )

    if emergency_command is not None:
        pass
    elif pending_cancel is not None:
        cancel_command = (
            service.build_navigation_cancel_command(
                pending_cancel
            )
        )

        if cancel_command is not None:
            await websocket.send_json(
                cancel_command
            )

    else:
        # Resend the current navigation command
        # when the Robot Agent reconnects.
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

    # Setup may have read state while preparing resend commands.  End that
    # transaction before waiting indefinitely for Robot Agent messages.
    db.rollback()

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
            elif message_type == "diagnostics":
                try:
                    diagnostics = (
                        DiagnosticsMessage.model_validate(
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
                        "INVALID_DIAGNOSTICS",
                        details,
                    )
                    continue

                severity = {
                    "OK": 0,
                    "WARN": 1,
                    "ERROR": 2,
                    "STALE": 3,
                }
                overall_level = (
                    max(
                        (
                            status.level
                            for status
                            in diagnostics.statuses
                        ),
                        key=severity.__getitem__,
                    )
                    if diagnostics.statuses
                    else "STALE"
                )

                await browser_connection_manager.broadcast_json(
                    {
                        "type": "robot_diagnostics",
                        "robot_id": robot_id,
                        "overall_level": overall_level,
                        "statuses": [
                            status.model_dump()
                            for status
                            in diagnostics.statuses
                        ],
                        "timestamp": diagnostics.timestamp,
                        "server_time": current_utc_time(),
                    },
                    admin_only=True,
                )

                alerts = AlertService(db)
                for diagnostic in diagnostics.statuses:
                    key = f"diagnostic:{robot_id}:{diagnostic.name}"
                    if diagnostic.level == "OK":
                        alert = alerts.resolve_key(key)
                        event = "resolved"
                    else:
                        severity_value = (
                            AlertSeverity.CRITICAL if diagnostic.level == "ERROR"
                            else AlertSeverity.WARNING
                        )
                        alert, event = alerts.upsert(
                            key, severity_value, f"{diagnostic.name}: {diagnostic.level}",
                            diagnostic.message or "Diagnostic condition requires attention",
                            "DIAGNOSTIC", robot_id,
                        )
                    if alert is not None:
                        await browser_connection_manager.broadcast_json(
                            {"type": "alert_changed", "event": event, "alert": Alert.model_validate(alert).model_dump(mode="json")},
                            admin_only=True,
                        )
                publish_committed_notifications(
                    db,
                    alerts.pending_notification_ids,
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
                            "battery_source": (
                                updated_robot.battery_source
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
                await browser_connection_manager.broadcast_json(
                    {
                        "type": "robot_telemetry",
                        "robot_id": robot_id,
                        "data": {
                            "x": updated_robot.x,
                            "y": updated_robot.y,
                            "yaw": updated_robot.yaw,
                            "last_seen": updated_robot.last_seen,
                        },
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
                await browser_connection_manager.broadcast_json(
                    {
                        "type": "map_updated",
                        "revision": snapshot.revision,
                    },
                    admin_only=True,
                )
            elif message_type == "map_catalog":
                try:
                    catalog_message = RobotMapCatalogMessage.model_validate(message)
                except ValidationError as error:
                    details = "; ".join(
                        f"{'.'.join(map(str, item['loc']))}: {item['msg']}"
                        for item in error.errors(include_url=False)
                    )
                    await send_error(websocket, "INVALID_MAP_CATALOG", details)
                    continue
                if catalog_message.robot_id != robot_id:
                    await send_error(
                        websocket,
                        "MAP_CATALOG_ROBOT_MISMATCH",
                        "robot_id does not match the authenticated connection",
                    )
                    continue
                catalog = map_catalog_store.update(catalog_message)
                await websocket.send_json(
                    {
                        "type": "map_catalog_ack",
                        "map_count": len(catalog.maps),
                        "active_map_id": catalog.active_map_id,
                        "server_time": current_utc_time(),
                    }
                )
                await browser_connection_manager.broadcast_json(
                    {
                        "type": "map_catalog_changed",
                        "catalog": catalog.model_dump(mode="json"),
                        "server_time": current_utc_time(),
                    },
                    admin_only=True,
                )
            elif message_type == "map_switch_result":
                try:
                    switch_result = RobotMapSwitchResultMessage.model_validate(message)
                except ValidationError as error:
                    details = "; ".join(
                        f"{'.'.join(map(str, item['loc']))}: {item['msg']}"
                        for item in error.errors(include_url=False)
                    )
                    await send_error(websocket, "INVALID_MAP_SWITCH_RESULT", details)
                    continue
                if switch_result.robot_id != robot_id:
                    await send_error(
                        websocket,
                        "MAP_SWITCH_ROBOT_MISMATCH",
                        "robot_id does not match the authenticated connection",
                    )
                    continue
                operation, matched = map_switch_store.complete(
                    switch_result.command_id,
                    robot_id,
                    switch_result.map_id,
                    accepted=switch_result.accepted,
                    detail=switch_result.detail,
                )
                if matched and operation is not None:
                    action = (
                        "map.switch_succeeded"
                        if switch_result.accepted else "map.switch_failed"
                    )
                    AuditService(db).log(
                        TrustedActor.robot(robot_id),
                        action,
                        "map",
                        switch_result.map_id,
                        {
                            "robot_id": robot_id,
                            "map_id": switch_result.map_id,
                            "command_id": switch_result.command_id,
                        },
                        result="success" if switch_result.accepted else "failed",
                    )
                    db.commit()
                    if switch_result.accepted:
                        map_store.clear()
                        catalog = map_catalog_store.set_active(
                            robot_id,
                            switch_result.map_id,
                        )
                    else:
                        catalog = None
                    await browser_connection_manager.broadcast_json(
                        {
                            "type": "map_switch_changed",
                            "operation": operation.model_dump(mode="json"),
                            "catalog": (
                                catalog.model_dump(mode="json")
                                if catalog is not None else None
                            ),
                            "server_time": current_utc_time(),
                        },
                        admin_only=True,
                    )
                await websocket.send_json(
                    {
                        "type": "map_switch_result_ack",
                        "command_id": switch_result.command_id,
                        "accepted": matched,
                        "server_time": current_utc_time(),
                    }
                )
            elif message_type == "map_catalog_operation_result":
                try:
                    result = RobotMapCatalogOperationResultMessage.model_validate(message)
                except ValidationError as error:
                    details = "; ".join(
                        f"{'.'.join(map(str, item['loc']))}: {item['msg']}"
                        for item in error.errors(include_url=False)
                    )
                    await send_error(websocket, "INVALID_MAP_CATALOG_OPERATION", details)
                    continue
                if result.robot_id != robot_id:
                    await send_error(
                        websocket,
                        "MAP_CATALOG_OPERATION_ROBOT_MISMATCH",
                        "robot_id does not match the authenticated connection",
                    )
                    continue
                operation, matched = map_catalog_operation_store.complete(
                    result.command_id,
                    robot_id,
                    result.map_id,
                    result.action,
                    accepted=result.accepted,
                    result_map_id=result.result_map_id,
                    detail=result.detail,
                )
                if matched and operation is not None:
                    suffix = "succeeded" if result.accepted else "failed"
                    AuditService(db).log(
                        TrustedActor.robot(robot_id),
                        f"map.{result.action.value.lower()}_{suffix}",
                        "map",
                        result.result_map_id or result.map_id,
                        {
                            "robot_id": robot_id,
                            "map_id": result.map_id,
                            "command_id": result.command_id,
                            "new_map_id": result.result_map_id,
                        },
                        result="success" if result.accepted else "failed",
                    )
                    db.commit()
                    await browser_connection_manager.broadcast_json(
                        {
                            "type": "map_catalog_operation_changed",
                            "operation": operation.model_dump(mode="json"),
                            "server_time": current_utc_time(),
                        },
                        admin_only=True,
                    )
                await websocket.send_json(
                    {
                        "type": "map_catalog_operation_result_ack",
                        "command_id": result.command_id,
                        "accepted": matched,
                        "server_time": current_utc_time(),
                    }
                )
            elif message_type == "mapping_status":
                try:
                    mapping_status = RobotMappingStatusMessage.model_validate(message)
                except ValidationError as error:
                    details = "; ".join(
                        f"{'.'.join(map(str, item['loc']))}: {item['msg']}"
                        for item in error.errors(include_url=False)
                    )
                    await send_error(websocket, "INVALID_MAPPING_STATUS", details)
                    continue
                if mapping_status.robot_id != robot_id:
                    await send_error(
                        websocket,
                        "MAPPING_ROBOT_MISMATCH",
                        "robot_id does not match the authenticated connection",
                    )
                    continue
                previous = mapping_store.get(robot_id)
                session = mapping_store.apply(mapping_status)
                if mapping_status.command_id and previous.phase != session.phase:
                    action = (
                        "mapping.command_succeeded"
                        if mapping_status.accepted else "mapping.command_failed"
                    )
                    AuditService(db).log(
                        TrustedActor.robot(robot_id),
                        action,
                        "map" if session.saved_map_id else "robot",
                        session.saved_map_id or robot_id,
                        {
                            "robot_id": robot_id,
                            "session_id": session.session_id,
                            "phase": session.phase.value,
                            "detail": session.detail,
                        },
                        result="success" if mapping_status.accepted else "failed",
                    )
                    db.commit()
                await websocket.send_json({
                    "type": "mapping_status_ack",
                    "command_id": mapping_status.command_id,
                    "accepted": True,
                    "server_time": current_utc_time(),
                })
                await browser_connection_manager.broadcast_json(
                    {
                        "type": "mapping_status_changed",
                        "mapping": session.model_dump(mode="json"),
                        "server_time": current_utc_time(),
                    },
                    admin_only=True,
                )
            elif message_type == "navigation_path":
                try:
                    navigation_path = (
                        NavigationPathMessage.model_validate(
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
                        "INVALID_NAVIGATION_PATH",
                        details,
                    )
                    continue

                db.expire_all()
                association_error = (
                    navigation_association_error(
                        service,
                        robot_id,
                        navigation_path.command_id,
                        navigation_path.task_id,
                        navigation_path.stage,
                    )
                )
                if association_error is not None:
                    await send_error(
                        websocket,
                        *association_error,
                    )
                    continue

                if not navigation_path_store.update(
                    robot_id,
                    navigation_path,
                ):
                    await send_error(
                        websocket,
                        "PATH_COMMAND_MISMATCH",
                        "active navigation command changed",
                    )
                    continue

                await browser_connection_manager.broadcast_json(
                    {
                        "type": "navigation_path",
                        "robot_id": robot_id,
                        **navigation_path.model_dump(
                            exclude={"type"}
                        ),
                        "server_time": current_utc_time(),
                    },
                    owner_id=service.get_task(navigation_path.task_id).owner_id,
                )
            elif message_type == "route_preview_result":
                try:
                    preview_result = RoutePreviewResultMessage.model_validate(
                        message
                    )
                except ValidationError as error:
                    details = "; ".join(
                        f"{'.'.join(map(str, item['loc']))}: {item['msg']}"
                        for item in error.errors(include_url=False)
                    )
                    await send_error(
                        websocket,
                        "INVALID_ROUTE_PREVIEW_RESULT",
                        details,
                    )
                    continue

                if not route_preview_coordinator.resolve(
                    robot_id,
                    preview_result,
                ):
                    await send_error(
                        websocket,
                        "UNKNOWN_ROUTE_PREVIEW",
                        "request_id is not pending for this robot",
                    )
            elif message_type == "navigation_path_clear":
                try:
                    path_clear = (
                        NavigationPathClearMessage.model_validate(
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
                        "INVALID_NAVIGATION_PATH_CLEAR",
                        details,
                    )
                    continue

                if not navigation_path_store.matches(
                    robot_id,
                    path_clear.command_id,
                    path_clear.task_id,
                    path_clear.stage,
                ):
                    await send_error(
                        websocket,
                        "PATH_COMMAND_MISMATCH",
                        (
                            "path clear does not match the "
                            "active navigation command"
                        ),
                    )
                    continue

                await broadcast_path_clear(
                    robot_id,
                    "robot_agent_clear",
                    remove_command=False,
                )

            elif message_type == "navigation_feedback":
                try:
                    feedback = (
                        NavigationFeedbackMessage.model_validate(
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
                        "INVALID_NAVIGATION_FEEDBACK",
                        details,
                    )
                    continue

                expected_prefix = (
                    f"{feedback.task_id}:"
                    f"{feedback.stage}:"
                )

                if not feedback.command_id.startswith(
                    expected_prefix
                ):
                    await send_error(
                        websocket,
                        "FEEDBACK_COMMAND_MISMATCH",
                        (
                            "command_id does not match "
                            "task_id and stage"
                        ),
                    )
                    continue

                db.expire_all()
                association_error = navigation_association_error(
                    service,
                    robot_id,
                    feedback.command_id,
                    feedback.task_id,
                    feedback.stage,
                )
                if association_error is not None:
                    await send_error(
                        websocket,
                        association_error[0].replace(
                            "PATH_", "FEEDBACK_"
                        ),
                        association_error[1],
                    )
                    continue

                current_robot = service.get_robot(
                    robot_id
                )

                if (
                    current_robot.current_task_id
                    != feedback.task_id
                ):
                    await send_error(
                        websocket,
                        "FEEDBACK_TASK_MISMATCH",
                        (
                            "Feedback task is not the "
                            "robot's current task"
                        ),
                    )
                    continue

                navigation_feedback_store.set(
                    robot_id,
                    LatestNavigationEstimate(
                        task_id=feedback.task_id,
                        stage=feedback.stage,
                        distance_remaining=feedback.distance_remaining,
                        estimated_time_remaining_seconds=(
                            feedback.estimated_time_remaining_seconds
                        ),
                    ),
                )

                await (
                    browser_connection_manager.broadcast_json(
                        {
                            "type": (
                                "navigation_feedback"
                            ),
                            "robot_id": robot_id,
                            "command_id": (
                                feedback.command_id
                            ),
                            "task_id": feedback.task_id,
                            "stage": feedback.stage,
                            "distance_remaining": (
                                feedback.distance_remaining
                            ),
                            "navigation_time_seconds": (
                                feedback.navigation_time_seconds
                            ),
                            (
                                "estimated_time_"
                                "remaining_seconds"
                            ): (
                                feedback
                                .estimated_time_remaining_seconds
                            ),
                            "number_of_recoveries": (
                                feedback.number_of_recoveries
                            ),
                            "linear_velocity": (
                                feedback.linear_velocity
                            ),
                            "angular_velocity": (
                                feedback.angular_velocity
                            ),
                            "current_pose": (
                                feedback.current_pose.model_dump()
                            ),
                            "timestamp": feedback.timestamp,
                            "server_time": (
                                current_utc_time()
                            ),
                        },
                        owner_id=service.get_task(feedback.task_id).owner_id,
                    )
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

                db.expire_all()
                association_error = navigation_association_error(
                    service,
                    robot_id,
                    navigation.command_id,
                    navigation.task_id,
                    navigation.stage,
                )
                if association_error is not None:
                    await send_error(
                        websocket,
                        association_error[0].replace(
                            "PATH_", "RESULT_"
                        ),
                        association_error[1],
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
                            actor=TrustedActor.robot(robot_id),
                        )
                    )
                    publish_committed_notifications(
                        service.db, service.take_pending_notification_ids()
                    )
                except HTTPException as error:
                    await send_error(
                        websocket,
                        "TASK_TRANSITION_REJECTED",
                        str(error.detail),
                    )
                    continue

                await broadcast_path_clear(
                    robot_id,
                    "navigation_result",
                )
                navigation_feedback_store.clear_matching(
                    robot_id,
                    navigation.task_id,
                    navigation.stage,
                )

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
                await browser_connection_manager.broadcast_json(
                    {
                        "type": "workflow_updated",
                        "reason": "navigation_result",
                        "robot_id": robot_id,
                        "task_id": navigation.task_id,
                        "task_status": (
                            updated_task.status.value
                        ),
                        "navigation_status": (
                            navigation.status
                        ),
                        "stage": navigation.stage,
                        "server_time": (
                            current_utc_time()
                        ),
                    },
                    owner_id=updated_task.owner_id,
                )
                if navigation.status != "succeeded":
                    alerts = AlertService(db)
                    alert, event = alerts.upsert(
                        f"navigation-failed:{robot_id}:{navigation.task_id}", AlertSeverity.CRITICAL,
                        "Nav2 navigation aborted", navigation.detail or "Navigation did not complete",
                        "NAVIGATION", robot_id,
                    )
                    publish_committed_notifications(
                        db,
                        alerts.pending_notification_ids,
                    )
                    await browser_connection_manager.broadcast_json(
                        {"type": "alert_changed", "event": event, "alert": Alert.model_validate(alert).model_dump(mode="json")},
                        admin_only=True,
                    )
                    next_task = service.active_task()
                    if (
                        next_task is not None
                        and next_task.robot_id == robot_id
                        and next_task.id != navigation.task_id
                    ):
                        next_command = service.build_navigation_command(
                            next_task
                        )
                        if next_command is not None:
                            await websocket.send_json(next_command)
            elif message_type == "navigation_cancelled":
                cancel_id = message.get(
                    "cancel_id"
                )
                task_id = message.get(
                    "task_id"
                )
                cancelled = message.get(
                    "cancelled"
                )
                detail = message.get(
                    "detail"
                )

                if (
                    not isinstance(cancel_id, str)
                    or not cancel_id
                    or not isinstance(task_id, str)
                    or not task_id
                    or not isinstance(cancelled, bool)
                ):
                    await send_error(
                        websocket,
                        "INVALID_NAVIGATION_CANCEL",
                        (
                            "cancel_id and task_id must "
                            "be non-empty strings and "
                            "cancelled must be boolean"
                        ),
                    )
                    continue

                expected_prefix = (
                    f"{task_id}:cancel:"
                )

                if not cancel_id.startswith(
                    expected_prefix
                ):
                    await send_error(
                        websocket,
                        "CANCEL_TASK_MISMATCH",
                        (
                            "cancel_id does not match "
                            "task_id"
                        ),
                    )
                    continue

                if not cancelled:
                    await send_error(
                        websocket,
                        "NAVIGATION_CANCEL_FAILED",
                        (
                            str(detail)
                            if detail
                            else (
                                "Robot Agent could not "
                                "cancel the Nav2 goal"
                            )
                        ),
                    )
                    continue

                try:
                    db.expire_all()

                    cancelled_task = (
                        service.finalize_navigation_cancel(
                            task_id,
                            robot_id,
                            (
                                str(detail)
                                if detail
                                else None
                            ),
                        )
                    )
                except HTTPException as error:
                    await send_error(
                        websocket,
                        "CANCEL_TRANSITION_REJECTED",
                        str(error.detail),
                    )
                    continue

                await broadcast_path_clear(
                    robot_id,
                    "navigation_cancelled",
                )
                navigation_feedback_store.clear_matching(
                    robot_id,
                    task_id,
                )

                await websocket.send_json(
                    {
                        "type": (
                            "navigation_cancelled_received"
                        ),
                        "robot_id": robot_id,
                        "cancel_id": cancel_id,
                        "task_id": task_id,
                        "task_status": (
                            cancelled_task.status.value
                        ),
                        "accepted": True,
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )

                await browser_connection_manager.broadcast_json(
                    {
                        "type": "workflow_updated",
                        "reason": (
                            "navigation_cancelled"
                        ),
                        "robot_id": robot_id,
                        "task_id": task_id,
                        "task_status": (
                            cancelled_task.status.value
                        ),
                        "server_time": (
                            current_utc_time()
                        ),
                    }
                )

                next_task = service.active_task()

                if (
                    next_task is not None
                    and next_task.robot_id == robot_id
                ):
                    next_command = (
                        service.build_navigation_command(
                            next_task
                        )
                    )

                    if next_command is not None:
                        await websocket.send_json(
                            next_command
                        )

            elif message_type == "emergency_ack":
                command_id = message.get("command_id")
                command = message.get("command")
                accepted = message.get("accepted")
                if not isinstance(command_id, str) or command not in {"emergency_stop", "emergency_stop_reset"} or not isinstance(accepted, bool):
                    await send_error(websocket, "INVALID_EMERGENCY_ACK", "Invalid Emergency Stop acknowledgement")
                    continue
                emergency_service = EmergencyStopService(db)
                state, matched = emergency_service.acknowledge(
                    robot_id, command_id, command, accepted,
                    str(message.get("detail")) if message.get("detail") else None,
                )
                if not matched:
                    await send_error(websocket, "STALE_EMERGENCY_ACK", "Acknowledgement does not match the pending command")
                    continue
                publish_committed_notifications(
                    db,
                    emergency_service.pending_notification_ids,
                )
                await websocket.send_json({"type": "emergency_ack_received", "command_id": command_id, "accepted": True, "server_time": current_utc_time()})
                await browser_connection_manager.broadcast_json(
                    {"type": "emergency_stop_changed", "emergency_stop": EmergencyStop.model_validate(state).model_dump(mode="json")}
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
                        "'heartbeat', 'diagnostics', "
                        "'telemetry', 'map', "
                        "'route_preview_result', "
                        "'navigation_path', "
                        "'navigation_path_clear', "
                        "'navigation_feedback', "
                        "'navigation_result', "
                        "'navigation_cancelled' and "
                        "'command_ack'"
                    ),
                )

    except WebSocketDisconnect:
        disconnected = robot_connection_manager.disconnect(
            robot_id,
            websocket,
        )
        if disconnected:
            publish_committed_notifications(
                db, service.record_robot_connection(robot_id, False)
            )
            route_preview_coordinator.fail_robot(
                robot_id,
                "ROS Bridge disconnected during route preview",
            )
            navigation_feedback_store.clear_robot(robot_id)
            await broadcast_path_clear(
                robot_id,
                "robot_disconnect",
                remove_command=False,
            )
            alerts = AlertService(db)
            alert, event = alerts.upsert(
                f"robot-offline:{robot_id}", AlertSeverity.CRITICAL, "Robot disconnected",
                "Robot WebSocket connection was lost.", "CONNECTION", robot_id,
            )
            publish_committed_notifications(
                db,
                alerts.pending_notification_ids,
            )
            await browser_connection_manager.broadcast_json(
                {"type": "alert_changed", "event": event, "alert": Alert.model_validate(alert).model_dump(mode="json")},
                admin_only=True,
            )

    except Exception:
        disconnected = robot_connection_manager.disconnect(
            robot_id,
            websocket,
        )
        if disconnected:
            publish_committed_notifications(
                db, service.record_robot_connection(robot_id, False)
            )
            route_preview_coordinator.fail_robot(
                robot_id,
                "ROS Bridge disconnected during route preview",
            )
            navigation_feedback_store.clear_robot(robot_id)
            await broadcast_path_clear(
                robot_id,
                "robot_disconnect",
                remove_command=False,
            )

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass

        raise
