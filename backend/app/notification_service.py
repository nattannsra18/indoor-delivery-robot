from __future__ import annotations

from uuid import uuid4
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db_models import NotificationORM, UserORM
from .models import AlertSeverity, NotificationCategory, UserRole
from .models import utc_now

MAX_PAGE_SIZE = 100

class NotificationService:
    def __init__(self, db: Session): self.db = db
    def create(self, recipient_id: str, event_type: str, title: str, message: str, key: str, entity_type: str | None = None, entity_id: str | None = None, *, category: NotificationCategory | None = None, severity: AlertSeverity | None = None, action_required: bool | None = None):
        # A savepoint alone may commit on SQLite when no outer transaction is
        # active.  Start one explicitly so notification, audit and domain
        # mutation remain atomic until the owning service commits.
        category = category or notification_category(event_type)
        severity = severity or (AlertSeverity.CRITICAL if category == NotificationCategory.CRITICAL else AlertSeverity.WARNING if category == NotificationCategory.ACTION_REQUIRED else AlertSeverity.INFO)
        action_required = category in {NotificationCategory.ACTION_REQUIRED, NotificationCategory.CRITICAL} if action_required is None else action_required
        item = NotificationORM(id=str(uuid4()), recipient_id=recipient_id, event_type=event_type, title=title, message=message, deduplication_key=key, entity_type=entity_type, entity_id=entity_id, category=category, severity=severity, action_required=action_required)
        if not self.db.in_transaction():
            self.db.add(item)
            self.db.flush()
            return item
        try:
            with self.db.begin_nested(): self.db.add(item); self.db.flush()
        except IntegrityError:
            return self.db.scalar(select(NotificationORM).where(NotificationORM.recipient_id == recipient_id, NotificationORM.deduplication_key == key))
        return item

    def create_for_admins(self, event_type: str, title: str, message: str, key: str, entity_type: str | None = None, entity_id: str | None = None, *, category: NotificationCategory | None = None, severity: AlertSeverity | None = None, action_required: bool | None = None) -> list[NotificationORM]:
        admins = self.db.scalars(select(UserORM.id).where(UserORM.role == UserRole.ADMIN, UserORM.active.is_(True))).all()
        return [item for admin_id in admins if (item := self.create(admin_id, event_type, title, message, f"admin:{key}", entity_type, entity_id, category=category, severity=severity, action_required=action_required)) is not None]
    def list(self, recipient_id: str, offset: int, limit: int, *, category: NotificationCategory | None = None, unread_only: bool = False):
        limit = min(max(limit, 1), MAX_PAGE_SIZE)
        statement = select(NotificationORM).where(NotificationORM.recipient_id == recipient_id)
        if category is not None: statement = statement.where(NotificationORM.category == category)
        if unread_only: statement = statement.where(NotificationORM.read_at.is_(None))
        items = list(self.db.scalars(statement.order_by(NotificationORM.created_at.desc(), NotificationORM.id.desc()).offset(offset).limit(limit)).all())
        unread = int(self.db.scalar(select(func.count()).select_from(NotificationORM).where(NotificationORM.recipient_id == recipient_id, NotificationORM.read_at.is_(None))) or 0)
        return items, unread, offset + len(items) if len(items) == limit else None
    def unread_by_category(self, recipient_id: str) -> dict[NotificationCategory, int]:
        rows = self.db.execute(select(NotificationORM.category, func.count()).where(NotificationORM.recipient_id == recipient_id, NotificationORM.read_at.is_(None)).group_by(NotificationORM.category)).all()
        return {category: int(count) for category, count in rows}
    def mark_read(self, recipient_id: str, notification_id: str):
        item = self.db.scalar(select(NotificationORM).where(NotificationORM.id == notification_id, NotificationORM.recipient_id == recipient_id).with_for_update())
        if item and item.read_at is None: item.read_at = utc_now(); self.db.commit()
        return item
    def mark_all_read(self, recipient_id: str):
        for item in self.db.scalars(select(NotificationORM).where(NotificationORM.recipient_id == recipient_id, NotificationORM.read_at.is_(None)).with_for_update()): item.read_at = utc_now()
        self.db.commit()
    def mark_many_read(self, recipient_id: str, notification_ids: list[str]) -> list[NotificationORM]:
        unique_ids = list(dict.fromkeys(notification_ids))
        items = list(self.db.scalars(select(NotificationORM).where(NotificationORM.id.in_(unique_ids), NotificationORM.recipient_id == recipient_id).with_for_update()).all())
        now = utc_now()
        for item in items:
            if item.read_at is None: item.read_at = now
        self.db.commit()
        return items


def notification_category(event_type: str) -> NotificationCategory:
    if event_type in {
        "task.navigation_failed", "emergency.activate_requested",
        "emergency.activate_succeeded", "emergency.command_failed",
        "robot.disconnected",
    }:
        return NotificationCategory.CRITICAL
    if event_type in {"task.arrived_pickup", "task.arrived_destination"}:
        return NotificationCategory.ACTION_REQUIRED
    if event_type in {"alert.created", "alert.reopened"}:
        return NotificationCategory.ACTION_REQUIRED
    if event_type.startswith("robot.") or event_type.startswith("emergency.") or event_type == "alert.resolved":
        return NotificationCategory.SYSTEM
    return NotificationCategory.DELIVERY
