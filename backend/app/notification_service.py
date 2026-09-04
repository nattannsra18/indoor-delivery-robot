from __future__ import annotations

from uuid import uuid4
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .db_models import NotificationORM, UserORM
from .models import UserRole
from .models import utc_now

MAX_PAGE_SIZE = 100

class NotificationService:
    def __init__(self, db: Session): self.db = db
    def create(self, recipient_id: str, event_type: str, title: str, message: str, key: str, entity_type: str | None = None, entity_id: str | None = None):
        # A savepoint alone may commit on SQLite when no outer transaction is
        # active.  Start one explicitly so notification, audit and domain
        # mutation remain atomic until the owning service commits.
        item = NotificationORM(id=str(uuid4()), recipient_id=recipient_id, event_type=event_type, title=title, message=message, deduplication_key=key, entity_type=entity_type, entity_id=entity_id)
        if not self.db.in_transaction():
            self.db.add(item)
            self.db.flush()
            return item
        try:
            with self.db.begin_nested(): self.db.add(item); self.db.flush()
        except IntegrityError:
            return self.db.scalar(select(NotificationORM).where(NotificationORM.recipient_id == recipient_id, NotificationORM.deduplication_key == key))
        return item

    def create_for_admins(self, event_type: str, title: str, message: str, key: str, entity_type: str | None = None, entity_id: str | None = None) -> list[NotificationORM]:
        admins = self.db.scalars(select(UserORM.id).where(UserORM.role == UserRole.ADMIN, UserORM.active.is_(True))).all()
        return [item for admin_id in admins if (item := self.create(admin_id, event_type, title, message, f"admin:{key}", entity_type, entity_id)) is not None]
    def list(self, recipient_id: str, offset: int, limit: int):
        limit = min(max(limit, 1), MAX_PAGE_SIZE)
        items = list(self.db.scalars(select(NotificationORM).where(NotificationORM.recipient_id == recipient_id).order_by(NotificationORM.created_at.desc(), NotificationORM.id.desc()).offset(offset).limit(limit)).all())
        unread = int(self.db.scalar(select(func.count()).select_from(NotificationORM).where(NotificationORM.recipient_id == recipient_id, NotificationORM.read_at.is_(None))) or 0)
        return items, unread, offset + len(items) if len(items) == limit else None
    def mark_read(self, recipient_id: str, notification_id: str):
        item = self.db.scalar(select(NotificationORM).where(NotificationORM.id == notification_id, NotificationORM.recipient_id == recipient_id).with_for_update())
        if item and item.read_at is None: item.read_at = utc_now(); self.db.commit()
        return item
    def mark_all_read(self, recipient_id: str):
        for item in self.db.scalars(select(NotificationORM).where(NotificationORM.recipient_id == recipient_id, NotificationORM.read_at.is_(None)).with_for_update()): item.read_at = utc_now()
        self.db.commit()
