from __future__ import annotations
import json
from sqlalchemy import select
from sqlalchemy.orm import Session
from .db_models import AuditRecordORM
from .domain_context import ActorType, TrustedActor

ALLOWED_METADATA = frozenset({"task_status", "robot_id", "alert_id", "reason", "priority"})
ALLOWED_ACTION_FILTERS = frozenset({"auth.login", "auth.logout", "task.created", "task.dispatched", "task.cancel", "task.retry", "task.confirm_loaded", "task.confirm_received", "task.arrived_pickup", "task.arrived_destination", "task.navigation_failed", "alert.created", "alert.reopened", "alert.acknowledged", "alert.resolved", "emergency.activate_requested", "emergency.reset_requested", "emergency.activate_succeeded", "emergency.reset_succeeded", "emergency.command_failed", "robot.offline", "robot.online", "robot.recovered", "robot.connected", "robot.disconnected", "station.created", "station.deleted"})
class AuditService:
    def __init__(self, db: Session): self.db = db
    def log(self, actor: TrustedActor | str | None, action: str, entity_type: str, entity_id: str | None, metadata: dict | None = None, result="success"):
        safe = {key: str(value)[:200] for key, value in (metadata or {}).items() if key in ALLOWED_METADATA}
        if isinstance(actor, TrustedActor):
            actor_type = actor.actor_type.value
            actor_id = actor.user_id if actor.actor_type == ActorType.USER else None
            actor_identifier = actor.user_id if actor.actor_type == ActorType.USER else actor.robot_id
        elif actor is not None:
            actor_type, actor_id, actor_identifier = ActorType.USER.value, actor, actor
        else:
            actor_type, actor_id, actor_identifier = ActorType.SYSTEM.value, None, None
        record = AuditRecordORM(actor_id=actor_id, actor_type=actor_type, actor_identifier=actor_identifier, action=action, result=result, entity_type=entity_type, entity_id=entity_id, metadata_json=json.dumps(safe, sort_keys=True))
        self.db.add(record)
        self.db.flush()
        return record
    def list(self, offset: int, limit: int, action: str | None = None):
        stmt = select(AuditRecordORM).order_by(AuditRecordORM.created_at.desc(), AuditRecordORM.id.desc())
        if action: stmt = stmt.where(AuditRecordORM.action == action)
        limit = min(max(limit, 1), 100); items = list(self.db.scalars(stmt.offset(offset).limit(limit)).all())
        return items, offset + len(items) if len(items) == limit else None
