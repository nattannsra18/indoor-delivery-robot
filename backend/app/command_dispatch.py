from __future__ import annotations

from datetime import datetime, timezone

from fastapi import BackgroundTasks

from .browser_websocket_manager import browser_connection_manager
from .db_models import DeliveryTaskORM
from .navigation_path_store import navigation_path_store
from .service import DeliveryService
from .websocket_manager import (
    robot_connection_manager,
)


def schedule_navigation_command(
    background_tasks: BackgroundTasks,
    service: DeliveryService,
    task: DeliveryTaskORM,
) -> None:
    command = service.build_navigation_command(task)

    if command is None or task.robot_id is None:
        return

    background_tasks.add_task(
        robot_connection_manager.send_json,
        task.robot_id,
        command,
    )


def schedule_active_navigation_command(
    background_tasks: BackgroundTasks,
    service: DeliveryService,
) -> None:
    active_task = service.active_task()

    if active_task is None:
        return

    schedule_navigation_command(
        background_tasks,
        service,
        active_task,
    )

def schedule_navigation_cancel_command(
    background_tasks: BackgroundTasks,
    service: DeliveryService,
    task: DeliveryTaskORM,
) -> None:
    command = (
        service.build_navigation_cancel_command(
            task
        )
    )

    if command is None or task.robot_id is None:
        return

    background_tasks.add_task(
        robot_connection_manager.send_json,
        task.robot_id,
        command,
    )


def schedule_navigation_path_clear(
    background_tasks: BackgroundTasks,
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

    background_tasks.add_task(
        browser_connection_manager.broadcast_json,
        {
            "type": "navigation_path_clear",
            "robot_id": robot_id,
            "command_id": command.command_id,
            "task_id": command.task_id,
            "stage": command.stage,
            "reason": reason,
            "server_time": datetime.now(
                timezone.utc
            ).isoformat(),
        },
    )
