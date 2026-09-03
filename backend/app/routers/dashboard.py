from fastapi import APIRouter, Depends

from ..dependencies import get_service
from ..auth import require_admin, require_user
from ..db_models import UserORM
from ..models import DashboardOverview, UserRole
from ..service import DeliveryService

router = APIRouter(prefix="/api", tags=["dashboard"])


@router.get("/overview", response_model=DashboardOverview)
def overview(service: DeliveryService = Depends(get_service), user: UserORM = Depends(require_user)):
    return service.overview(None if user.role == UserRole.ADMIN else user.id)


@router.post("/demo/reset", response_model=DashboardOverview)
def reset_demo(service: DeliveryService = Depends(get_service), _: UserORM = Depends(require_admin)):
    return service.reset_demo()
