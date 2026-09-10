from fastapi import APIRouter, Depends, Query, Response, status

from ..dependencies import get_service
from ..models import Station, StationCreate, StationUpdate, UserRole
from ..service import DeliveryService
from ..auth import require_admin, require_user
from ..db_models import UserORM

router = APIRouter(prefix="/api/stations", tags=["stations"])


@router.get("", response_model=list[Station])
def list_stations(
    map_id: str | None = Query(default=None, min_length=1, max_length=120),
    robot_id: str | None = Query(default=None, min_length=1, max_length=100),
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_user),
):
    if (
        map_id is not None
        and user.role != UserRole.ADMIN
        and map_id != service.active_map_id()
    ):
        return service.list_stations()
    return service.list_stations(map_id, robot_id if user.role == UserRole.ADMIN else None)


@router.get("/{station_id}", response_model=Station)
def get_station(station_id: str, service: DeliveryService = Depends(get_service), _: UserORM = Depends(require_user)):
    return service.get_station(station_id)


@router.post("", response_model=Station, status_code=status.HTTP_201_CREATED)
def create_station(
    payload: StationCreate,
    robot_id: str | None = Query(default=None, min_length=1, max_length=100),
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_admin),
):
    return service.add_station(payload, user.id, robot_id)


@router.put("/{station_id}", response_model=Station)
def update_station(
    station_id: str,
    payload: StationUpdate,
    robot_id: str | None = Query(default=None, min_length=1, max_length=100),
    service: DeliveryService = Depends(get_service),
    user: UserORM = Depends(require_admin),
):
    return service.update_station(station_id, payload, user.id, robot_id)


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station(station_id: str, service: DeliveryService = Depends(get_service), user: UserORM = Depends(require_admin)):
    service.delete_station(station_id, user.id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
