from fastapi import APIRouter, Depends

from ..alert_service import AlertService
from ..auth import require_admin
from ..browser_websocket_manager import browser_connection_manager
from ..database import get_db
from ..db_models import UserORM
from ..models import Alert
from sqlalchemy.orm import Session

router = APIRouter(prefix="/api/alerts", tags=["alerts"], dependencies=[Depends(require_admin)])


def service(db: Session = Depends(get_db)) -> AlertService:
    return AlertService(db)


@router.get("", response_model=list[Alert])
def list_alerts(alerts: AlertService = Depends(service)):
    return alerts.list()


@router.get("/active", response_model=list[Alert])
def active_alerts(alerts: AlertService = Depends(service)):
    return alerts.list(active_only=True)


async def broadcast(event: str, alert: Alert) -> None:
    await browser_connection_manager.broadcast_json(
        {"type": "alert_changed", "event": event, "alert": alert.model_dump(mode="json")},
        admin_only=True,
    )


@router.post("/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge(alert_id: str, alerts: AlertService = Depends(service), user: UserORM = Depends(require_admin)):
    alert = alerts.acknowledge(alert_id, user.id)
    await broadcast("acknowledged", Alert.model_validate(alert))
    return alert


@router.post("/{alert_id}/resolve", response_model=Alert)
async def resolve(alert_id: str, alerts: AlertService = Depends(service)):
    alert = alerts.resolve(alert_id)
    await broadcast("resolved", Alert.model_validate(alert))
    return alert
