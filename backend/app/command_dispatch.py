from __future__ import annotations

from fastapi import BackgroundTasks

from .db_models import DeliveryTaskORM
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
