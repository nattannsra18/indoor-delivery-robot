from datetime import timedelta

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
    TaskPriority,
    TaskRoutePreview,
    TaskRoutePreviewRequest,
    TaskStatus,
    utc_now,
)
from ..service import DeliveryService
from ..auth import require_user
from ..db_models import DeliveryTaskORM, UserORM
from ..models import UserRole
from ..queue_estimate_service import QueueEstimateService
from ..map_store import map_store
from ..route_preview import (
    PREVIEW_LOADING_SECONDS,
    PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND,
    PREVIEW_UNLOADING_SECONDS,
    PREVIEW_VALIDITY_SECONDS,
    RoutePreviewUnavailableError,
    path_distance,
    route_preview_coordinator,
)
from ..websocket_manager import robot_connection_manager
from ..notification_delivery import publish_committed_notifications
from ..domain_context import TrustedActor

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


def authorize_priority(user: UserORM, priority: TaskPriority) -> None:
    if user.role != UserRole.ADMIN and priority == TaskPriority.HIGH:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only administrators can create HIGH priority tasks",
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
    "/preview",
    response_model=TaskRoutePreview,
)
async def preview_task_route(
    payload: TaskRoutePreviewRequest,
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    authorize_priority(user, payload.priority)
    pickup = service.get_station(payload.pickup_station_id)
    destination = service.get_station(payload.destination_station_id)
    robot = service.get_robot("robot01")
    snapshot = map_store.get()

    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="ROS map is unavailable",
        )
    if not robot.online or not robot_connection_manager.is_connected(robot.id):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Robot or ROS Bridge is offline",
        )

    def pose(x: float, y: float, yaw: float) -> dict[str, float | str]:
        return {
            "frame_id": snapshot.frame_id,
            "x": float(x),
            "y": float(y),
            "yaw": float(yaw),
        }
    try:
        result = await route_preview_coordinator.request(
            robot.id,
            {
                "start": pose(robot.x, robot.y, robot.yaw),
                "pickup": pose(pickup.x, pickup.y, pickup.yaw),
                "destination": pose(
                    destination.x,
                    destination.y,
                    destination.yaw,
                ),
            },
        )
    except TimeoutError as error:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Nav2 route preview timed out",
        ) from error
    except RoutePreviewUnavailableError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error

    if result.status == "unavailable":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=result.detail or "Nav2 planner is unavailable",
        )
    if (
        result.status != "available"
        or not result.frame_id
        or not result.pickup_path
        or not result.delivery_path
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.detail or "Pickup or destination is unreachable",
        )
    if result.frame_id.lstrip("/") != snapshot.frame_id.lstrip("/"):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Nav2 preview frame does not match the active ROS map",
        )
    latest_snapshot = map_store.get()
    if latest_snapshot is None or latest_snapshot.revision != snapshot.revision:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="ROS map changed during route validation; preview again",
        )

    pickup_distance = path_distance(result.pickup_path)
    delivery_distance = path_distance(result.delivery_path)
    pickup_eta = pickup_distance / PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND
    destination_eta = (
        pickup_eta
        + PREVIEW_LOADING_SECONDS
        + delivery_distance / PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND
    )
    generated_at = utc_now()
    preview_id = route_preview_coordinator.issue_validation(
        owner_id=user.id,
        robot_id=robot.id,
        pickup_station_id=payload.pickup_station_id,
        destination_station_id=payload.destination_station_id,
        priority=payload.priority,
        map_revision=snapshot.revision,
        pickup_distance_meters=pickup_distance,
        delivery_distance_meters=delivery_distance,
    )
    return TaskRoutePreview(
        preview_id=preview_id,
        robot_id=robot.id,
        status="AVAILABLE",
        frame_id=result.frame_id,
        map_revision=snapshot.revision,
        pickup_path=result.pickup_path,
        delivery_path=result.delivery_path,
        pickup_distance_meters=pickup_distance,
        delivery_distance_meters=delivery_distance,
        total_distance_meters=pickup_distance + delivery_distance,
        travel_time_seconds=(
            pickup_distance + delivery_distance
        ) / PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND,
        pickup_eta_seconds=pickup_eta,
        destination_eta_seconds=destination_eta,
        completion_eta_seconds=destination_eta + PREVIEW_UNLOADING_SECONDS,
        generated_at=generated_at,
        expires_at=generated_at + timedelta(seconds=PREVIEW_VALIDITY_SECONDS),
    )


@router.post(
    "",
    response_model=DeliveryTask,
    status_code=status.HTTP_201_CREATED,
)
async def create_task(
    payload: DeliveryTaskCreate,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    authorize_priority(user, payload.priority)
    snapshot = map_store.get()
    validation = None
    if snapshot is not None:
        validation = route_preview_coordinator.consume_validation(
            payload.preview_id,
            owner_id=user.id,
            robot_id="robot01",
            pickup_station_id=payload.pickup_station_id,
            destination_station_id=payload.destination_station_id,
            priority=payload.priority,
            map_revision=snapshot.revision,
        )
    if validation is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A fresh successful route preview is required",
        )
    task = service.create_task(
        payload,
        owner_id=user.id,
        actor=TrustedActor.user(user),
        pickup_distance_meters=validation.pickup_distance_meters,
        delivery_distance_meters=validation.delivery_distance_meters,
    )
    publish_committed_notifications(
        service.db, service.take_pending_notification_ids()
    )

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
async def apply_operator_event(
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
        payload.detail, actor=TrustedActor.user(user),
    )
    publish_committed_notifications(
        service.db, service.take_pending_notification_ids()
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
async def cancel_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(
        get_service
    ),
    user: UserORM = Depends(require_user),
):
    authorize_task(user, service.get_task(task_id))
    task = service.cancel_task(task_id, actor=TrustedActor.user(user))
    publish_committed_notifications(
        service.db, service.take_pending_notification_ids()
    )

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
async def retry_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    authorize_task(user, service.get_task(task_id))
    task = service.retry_task(task_id, actor=TrustedActor.user(user))
    publish_committed_notifications(
        service.db, service.take_pending_notification_ids()
    )

    schedule_navigation_command(
        background_tasks,
        service,
        task,
    )

    return task
