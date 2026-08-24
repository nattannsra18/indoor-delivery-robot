from fastapi import APIRouter, Depends

from ..dependencies import get_service
from ..models import DashboardOverview
from ..service import DeliveryService

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverview)
def overview(service: DeliveryService = Depends(get_service)):
    return service.overview()


@router.post("/demo/reset", response_model=DashboardOverview)
def reset_demo(service: DeliveryService = Depends(get_service)):
    return service.reset_demo()
