from fastapi import APIRouter, BackgroundTasks, Depends

from ..command_dispatch import schedule_navigation_path_clear
from ..dependencies import get_service
from ..models import Robot
from ..service import DeliveryService
from ..auth import require_admin, require_user
from ..db_models import UserORM

router = APIRouter(prefix="/api/robots", tags=["robots"])


@router.get("", response_model=list[Robot])
def list_robots(service: DeliveryService = Depends(get_service), _: UserORM = Depends(require_user)):
    return service.list_robots()


@router.get("/{robot_id}", response_model=Robot)
def get_robot(robot_id: str, service: DeliveryService = Depends(get_service), _: UserORM = Depends(require_user)):
    return service.get_robot(robot_id)


@router.post("/{robot_id}/offline", response_model=Robot)
def set_offline(
    robot_id: str,
    background_tasks: BackgroundTasks,
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_admin),
):
    robot = service.set_robot_offline(robot_id, user.id)
    schedule_navigation_path_clear(
        background_tasks,
        robot_id,
        "robot_offline",
    )
    return robot


@router.post("/{robot_id}/online", response_model=Robot)
def set_online(robot_id: str, service: DeliveryService = Depends(get_service), user: UserORM = Depends(require_admin)):
    return service.set_robot_online(robot_id, user.id)


@router.post("/{robot_id}/recover", response_model=Robot)
def recover_robot(robot_id: str, service: DeliveryService = Depends(get_service), user: UserORM = Depends(require_admin)):
    return service.recover_robot(robot_id, user.id)
