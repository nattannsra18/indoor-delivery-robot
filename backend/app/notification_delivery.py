"""Central post-commit delivery for persistent dashboard notifications."""
from __future__ import annotations

import logging
from sqlalchemy.orm import Session

from .browser_websocket_manager import browser_connection_manager
from .db_models import NotificationORM
from .models import Notification

logger = logging.getLogger(__name__)


def publish_committed_notifications(db: Session, notification_ids: list[str]) -> None:
    """Delivery is deliberately best-effort; persistence has already committed."""
    for notification_id in dict.fromkeys(notification_ids):
        item = db.get(NotificationORM, notification_id)
        if item is None:
            continue
        payload = Notification.model_validate(item).model_dump(mode="json")
        try:
            browser_connection_manager.schedule_notification(
                {"type": "notification_created", "notification": payload},
                item.recipient_id,
            )
        except Exception:
            logger.warning("dashboard notification delivery failed for notification_id=%s", notification_id)
