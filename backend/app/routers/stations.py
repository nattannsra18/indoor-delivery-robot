from fastapi import APIRouter, Depends, Response, status

from ..dependencies import get_service
from ..models import Station, StationCreate
from ..service import DeliveryService

router = APIRouter(prefix="/api/stations", tags=["stations"])


@router.get("", response_model=list[Station])
def list_stations(service: DeliveryService = Depends(get_service)):
    return service.list_stations()


@router.get("/{station_id}", response_model=Station)
def get_station(station_id: str, service: DeliveryService = Depends(get_service)):
    return service.get_station(station_id)


@router.post("", response_model=Station, status_code=status.HTTP_201_CREATED)
def create_station(payload: StationCreate, service: DeliveryService = Depends(get_service)):
    return service.add_station(payload)


@router.delete("/{station_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_station(station_id: str, service: DeliveryService = Depends(get_service)):
    service.delete_station(station_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
