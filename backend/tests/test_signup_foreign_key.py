from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.auth import hash_password
from app.db_models import AuditRecordORM, NotificationORM, UserORM
from app.models import NotificationCategory, SignupRequest, UserRole
from app.routers.auth import signup


def test_signup_inserts_user_before_foreign_keyed_audit_record():
    engine = create_engine("sqlite:///:memory:")

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        cursor = connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    with session_factory() as db:
        db.add(UserORM(
            id="admin",
            username="admin",
            password_hash=hash_password("admin-pass", iterations=1000),
            role=UserRole.ADMIN,
            active=True,
        ))
        db.commit()
        result = signup(SignupRequest(
            email="signup@example.com",
            username="signup-user",
            password="Robot1234",
        ), db)
        user = db.scalar(select(UserORM).where(UserORM.username == "signup-user"))
        audit = db.scalar(select(AuditRecordORM).where(
            AuditRecordORM.action == "auth.signup"
        ))
        notification = db.scalar(select(NotificationORM).where(
            NotificationORM.event_type == "auth.account_requested"
        ))

        assert result.status == "PENDING_APPROVAL"
        assert user is not None and user.active is False
        assert audit is not None and audit.actor_id == user.id
        assert notification is not None
        assert notification.recipient_id == "admin"
        assert notification.entity_id == user.id
        assert notification.category == NotificationCategory.ACTION_REQUIRED
        assert notification.action_required is True

    engine.dispose()
