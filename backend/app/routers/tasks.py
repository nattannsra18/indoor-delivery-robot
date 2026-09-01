from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    HTTPException,
    Query,
    status,
)

from ..command_dispatch import (
    schedule_active_navigation_command,
    schedule_navigation_command,
    schedule_navigation_cancel_command,
)
from ..dependencies import get_service
from ..models import (
    DeliveryTask,
    DeliveryTaskCreate,
    EventSource,
    TaskEvent,
    TaskEventRequest,
    TaskHistoryEntry,
    TaskStatus,
)
from ..service import DeliveryService

router = APIRouter(
    prefix="/api/tasks",
    tags=["tasks"],
)

OPERATOR_EVENTS = frozenset(
    {
        TaskEvent.CONFIRM_LOADED,
        TaskEvent.CONFIRM_RECEIVED,
    }
)


@router.get("", response_model=list[DeliveryTask])
def list_tasks(
    task_status: TaskStatus | None = Query(
        default=None,
        alias="status",
    ),
    service: DeliveryService = Depends(get_service),
):
    return service.list_tasks(task_status)


@router.get(
    "/{task_id}",
    response_model=DeliveryTask,
)
def get_task(
    task_id: str,
    service: DeliveryService = Depends(get_service),
):
    return service.get_task(task_id)


@router.get(
    "/{task_id}/history",
    response_model=list[TaskHistoryEntry],
)
def get_task_history(
    task_id: str,
    service: DeliveryService = Depends(get_service),
):
    return service.get_task_history(task_id)


@router.post(
    "",
    response_model=DeliveryTask,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    payload: DeliveryTaskCreate,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_service),
):
    task = service.create_task(payload)

    schedule_navigation_command(
        background_tasks,
        service,
        task,
    )

    return task


@router.post(
    "/{task_id}/events",
    response_model=DeliveryTask,
)
def apply_operator_event(
    task_id: str,
    payload: TaskEventRequest,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_service),
):
    if payload.event not in OPERATOR_EVENTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{payload.event.value} must be reported "
                "by the ROS 2 Robot Agent"
            ),
        )

    task = service.apply_task_event(
        task_id,
        payload.event,
        EventSource.WEB_OPERATOR,
        payload.detail,
    )

    schedule_navigation_command(
        background_tasks,
        service,
        task,
    )

    if task.status == TaskStatus.COMPLETED:
        schedule_active_navigation_command(
            background_tasks,
            service,
        )

    return task


@router.post(
    "/{task_id}/cancel",
    response_model=DeliveryTask,
)
def cancel_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(
        get_service
    ),
):
    task = service.cancel_task(task_id)

    schedule_navigation_cancel_command(
        background_tasks,
        service,
        task,
    )

    return task


@router.post(
    "/{task_id}/retry",
    response_model=DeliveryTask,
)
def retry_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_service),
):
    task = service.retry_task(task_id)

    schedule_navigation_command(
        background_tasks,
        service,
        task,
    )

    return task