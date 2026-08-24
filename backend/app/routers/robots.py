from fastapi import APIRouter, Depends

from ..dependencies import get_service
from ..models import Robot
from ..service import DeliveryService

router = APIRouter(prefix="/api/robots", tags=["robots"])


@router.get("", response_model=list[Robot])
def list_robots(service: DeliveryService = Depends(get_service)):
    return service.list_robots()


@router.get("/{robot_id}", response_model=Robot)
def get_robot(robot_id: str, service: DeliveryService = Depends(get_service)):
    return service.get_robot(robot_id)
