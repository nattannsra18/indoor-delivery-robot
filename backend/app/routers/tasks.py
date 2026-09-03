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
    schedule_navigation_path_clear,
)
from ..dependencies import get_service
from ..models import (
    DeliveryTask,
    DeliveryTaskCreate,
    EventSource,
    TaskEvent,
    TaskEventRequest,
    TaskHistoryEntry,
    TaskEstimate,
    TaskStatus,
)
from ..service import DeliveryService
from ..auth import require_user
from ..db_models import DeliveryTaskORM, UserORM
from ..models import UserRole
from ..queue_estimate_service import QueueEstimateService

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


@router.get("/estimates", response_model=list[TaskEstimate])
def list_task_estimates(
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    owner_id = None if user.role == UserRole.ADMIN else user.id
    return QueueEstimateService(service.db).list_for_owner(owner_id)


def authorize_task(user: UserORM, task: DeliveryTaskORM) -> None:
    if user.role != UserRole.ADMIN and task.owner_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task access denied")


@router.get("", response_model=list[DeliveryTask])
def list_tasks(
    task_status: TaskStatus | None = Query(
        default=None,
        alias="status",
    ),
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    return service.list_tasks(task_status, None if user.role == UserRole.ADMIN else user.id)


@router.get(
    "/{task_id}",
    response_model=DeliveryTask,
)
def get_task(
    task_id: str,
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    task = service.get_task(task_id)
    authorize_task(user, task)
    return task


@router.get(
    "/{task_id}/history",
    response_model=list[TaskHistoryEntry],
)
def get_task_history(
    task_id: str,
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    authorize_task(user, service.get_task(task_id))
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
    user: UserORM = Depends(require_user),
):
    task = service.create_task(payload, owner_id=user.id)

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
    user: UserORM = Depends(require_user),
):
    if payload.event not in OPERATOR_EVENTS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"{payload.event.value} must be reported "
                "by the ROS 2 Robot Agent"
            ),
        )

    authorize_task(user, service.get_task(task_id))
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
    user: UserORM = Depends(require_user),
):
    authorize_task(user, service.get_task(task_id))
    task = service.cancel_task(task_id)

    if task.robot_id is not None:
        schedule_navigation_path_clear(
            background_tasks,
            task.robot_id,
            "cancellation_requested",
            remove_command=False,
        )

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
    user: UserORM = Depends(require_user),
):
    authorize_task(user, service.get_task(task_id))
    task = service.retry_task(task_id)

    schedule_navigation_command(
        background_tasks,
        service,
        task,
    )

    return task
