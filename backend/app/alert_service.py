from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .db_models import AlertORM
from .models import AlertSeverity, utc_now


class AlertService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list(self, *, active_only: bool = False) -> list[AlertORM]:
        statement = select(AlertORM)
        if active_only:
            statement = statement.where(AlertORM.active.is_(True))
        return list(self.db.scalars(statement.order_by(AlertORM.latest_occurrence_at.desc())).all())

    def get_by_key(self, key: str) -> AlertORM | None:
        return self.db.scalar(
            select(AlertORM).where(AlertORM.deduplication_key == key)
        )

    def upsert(
        self,
        key: str,
        severity: AlertSeverity,
        title: str,
        message: str,
        source: str,
        robot_id: str | None = None,
    ) -> tuple[AlertORM, str]:
        alert = self.get_by_key(key)
        now = utc_now()
        if alert is None:
            alert = AlertORM(
                id=str(uuid4()), deduplication_key=key, robot_id=robot_id,
                severity=severity, title=title, message=message, source=source,
                first_occurrence_at=now, latest_occurrence_at=now,
                occurrence_count=1, acknowledged=False, active=True,
            )
            self.db.add(alert)
            event = "created"
        else:
            event = "occurrence_updated" if alert.active else "reopened"
            alert.latest_occurrence_at = now
            alert.occurrence_count += 1
            alert.severity = severity
            alert.title = title
            alert.message = message
            alert.source = source
            alert.robot_id = robot_id
            if not alert.active:
                alert.active = True
                alert.resolved_at = None
                alert.acknowledged = False
                alert.acknowledged_at = None
                alert.acknowledged_by_user_id = None
        self.db.commit()
        self.db.refresh(alert)
        return alert, event

    def resolve_key(self, key: str) -> AlertORM | None:
        alert = self.get_by_key(key)
        if alert is None or not alert.active:
            return None
        alert.active = False
        alert.resolved_at = utc_now()
        self.db.commit()
        self.db.refresh(alert)
        return alert

    def acknowledge(self, alert_id: str, user_id: str) -> AlertORM:
        alert = self._get(alert_id)
        if not alert.acknowledged:
            alert.acknowledged = True
            alert.acknowledged_at = utc_now()
            alert.acknowledged_by_user_id = user_id
            self.db.commit()
            self.db.refresh(alert)
        return alert

    def resolve(self, alert_id: str) -> AlertORM:
        alert = self._get(alert_id)
        if alert.active:
            alert.active = False
            alert.resolved_at = utc_now()
            self.db.commit()
            self.db.refresh(alert)
        return alert

    def _get(self, alert_id: str) -> AlertORM:
        alert = self.db.get(AlertORM, alert_id)
        if alert is None:
            raise HTTPException(status_code=404, detail="Alert not found")
        return alert
