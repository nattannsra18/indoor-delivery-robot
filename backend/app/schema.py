from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_compatibility_migrations(engine: Engine) -> None:
    """Add backward-compatible columns to pre-Alembic databases."""
    # These tables were introduced after early deployments.  Creating only
    # missing tables is idempotent and never modifies existing domain data.
    from .database import Base
    for name in ("notifications", "audit_records", "password_reset_tokens"):
        Base.metadata.tables[name].create(bind=engine, checkfirst=True)
    inspector = inspect(engine)
    if "notifications" in inspector.get_table_names():
        notification_columns = {
            column["name"] for column in inspector.get_columns("notifications")
        }
        with engine.begin() as connection:
            if "category" not in notification_columns:
                connection.execute(text(
                    "ALTER TABLE notifications ADD COLUMN category "
                    "VARCHAR(20) NOT NULL DEFAULT 'DELIVERY'"
                ))
            if "severity" not in notification_columns:
                connection.execute(text(
                    "ALTER TABLE notifications ADD COLUMN severity "
                    "VARCHAR(10) NOT NULL DEFAULT 'INFO'"
                ))
            if "action_required" not in notification_columns:
                connection.execute(text(
                    "ALTER TABLE notifications ADD COLUMN action_required "
                    "BOOLEAN NOT NULL DEFAULT false"
                ))
            connection.execute(text("""
                UPDATE notifications SET
                    category = CASE
                        WHEN event_type IN (
                            'task.navigation_failed', 'emergency.activate_requested',
                            'emergency.activate_succeeded', 'emergency.command_failed',
                            'robot.disconnected'
                        ) THEN 'CRITICAL'
                        WHEN event_type IN ('task.arrived_pickup', 'task.arrived_destination')
                            THEN 'ACTION_REQUIRED'
                        WHEN event_type LIKE 'alert.%' AND event_type != 'alert.resolved'
                            THEN 'ACTION_REQUIRED'
                        WHEN event_type LIKE 'robot.%' OR event_type LIKE 'emergency.%'
                            OR event_type = 'alert.resolved' THEN 'SYSTEM'
                        ELSE 'DELIVERY'
                    END,
                    action_required = CASE
                        WHEN event_type IN (
                            'task.navigation_failed', 'task.arrived_pickup',
                            'task.arrived_destination', 'emergency.activate_requested',
                            'emergency.activate_succeeded', 'emergency.command_failed',
                            'robot.disconnected'
                        ) OR (event_type LIKE 'alert.%' AND event_type != 'alert.resolved')
                        THEN true ELSE false END
            """))
            connection.execute(text("""
                UPDATE notifications SET severity = CASE
                    WHEN category = 'CRITICAL' THEN 'CRITICAL'
                    WHEN category = 'ACTION_REQUIRED' THEN 'WARNING'
                    ELSE 'INFO' END
            """))
            if "alerts" in inspector.get_table_names():
                connection.execute(text("""
                    UPDATE notifications SET severity = COALESCE(
                        (SELECT alerts.severity FROM alerts WHERE alerts.id = notifications.entity_id),
                        severity
                    ) WHERE entity_type = 'alert'
                """))
            connection.execute(text("""
                UPDATE notifications SET category = 'CRITICAL', action_required = true
                WHERE entity_type = 'alert' AND severity = 'CRITICAL'
            """))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_notifications_category ON notifications (category)"
            ))
            connection.execute(text(
                "CREATE INDEX IF NOT EXISTS ix_notifications_action_required ON notifications (action_required)"
            ))

    inspector = inspect(engine)
    if "users" in inspector.get_table_names():
        user_columns = {column["name"] for column in inspector.get_columns("users")}
        with engine.begin() as connection:
            if "email" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN email VARCHAR(320)"))
            if "google_subject" not in user_columns:
                connection.execute(text("ALTER TABLE users ADD COLUMN google_subject VARCHAR(255)"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))
            connection.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_google_subject ON users (google_subject)"))
    audit_columns = {
        column["name"] for column in inspect(engine).get_columns("audit_records")
    }
    with engine.begin() as connection:
        if "actor_type" not in audit_columns:
            connection.execute(text("ALTER TABLE audit_records ADD COLUMN actor_type VARCHAR(16) NOT NULL DEFAULT 'SYSTEM'"))
        if "actor_identifier" not in audit_columns:
            connection.execute(text("ALTER TABLE audit_records ADD COLUMN actor_identifier VARCHAR(80)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_records_actor_type ON audit_records (actor_type)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_audit_records_actor_identifier ON audit_records (actor_identifier)"))
    inspector = inspect(engine)
    if "stations" in inspector.get_table_names():
        station_columns = {
            column["name"] for column in inspector.get_columns("stations")
        }
        with engine.begin() as connection:
            if "location" not in station_columns:
                connection.execute(
                    text("ALTER TABLE stations ADD COLUMN location VARCHAR(200)")
                )
                connection.execute(text("""
                    UPDATE stations SET location = CASE id
                        WHEN 'A' THEN 'Main warehouse · Ground floor · Front office'
                        WHEN 'B' THEN 'Main warehouse · Ground floor · Storage zone'
                        WHEN 'C' THEN 'Main warehouse · Ground floor · Production zone'
                        WHEN 'D' THEN 'Main warehouse · Ground floor · Quality control area'
                        ELSE location END
                    WHERE id IN ('A', 'B', 'C', 'D')
                """))
            if "instructions" not in station_columns:
                connection.execute(
                    text("ALTER TABLE stations ADD COLUMN instructions VARCHAR(400)")
                )
                connection.execute(text("""
                    UPDATE stations SET instructions = CASE id
                        WHEN 'A' THEN 'Use the marked handoff point beside the reception desk.'
                        WHEN 'B' THEN 'Meet the robot at the aisle entrance and keep the route clear.'
                        WHEN 'C' THEN 'Use the designated handoff point outside the production line.'
                        WHEN 'D' THEN 'Meet the robot beside the quality control entrance.'
                        ELSE instructions END
                    WHERE id IN ('A', 'B', 'C', 'D')
                """))

    inspector = inspect(engine)
    if "robots" in inspector.get_table_names():
        robot_columns = {
            column["name"] for column in inspector.get_columns("robots")
        }
        if "battery_source" not in robot_columns:
            with engine.begin() as connection:
                connection.execute(text(
                    "ALTER TABLE robots ADD COLUMN battery_source "
                    "VARCHAR(20) NOT NULL DEFAULT 'UNAVAILABLE'"
                ))

    if "delivery_tasks" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("delivery_tasks")}
    if "owner_id" not in columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE delivery_tasks ADD COLUMN owner_id VARCHAR(40)"))
            if engine.dialect.name == "postgresql":
                connection.execute(
                    text(
                        "ALTER TABLE delivery_tasks ADD CONSTRAINT fk_delivery_tasks_owner "
                        "FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL"
                    )
                )
            connection.execute(text("CREATE INDEX ix_delivery_tasks_owner_id ON delivery_tasks (owner_id)"))

    # Refresh after each compatibility change so startup is safe for databases
    # created by any earlier project step.
    columns = {column["name"] for column in inspect(engine).get_columns("delivery_tasks")}
    with engine.begin() as connection:
        if "priority" not in columns:
            connection.execute(
                text(
                    "ALTER TABLE delivery_tasks ADD COLUMN priority "
                    "VARCHAR(6) NOT NULL DEFAULT 'NORMAL'"
                )
            )
        if "recipient_name" not in columns:
            connection.execute(
                text("ALTER TABLE delivery_tasks ADD COLUMN recipient_name VARCHAR(100)")
            )
        if "delivery_note" not in columns:
            connection.execute(
                text("ALTER TABLE delivery_tasks ADD COLUMN delivery_note TEXT")
            )
        if "pickup_distance_meters" not in columns:
            connection.execute(
                text("ALTER TABLE delivery_tasks ADD COLUMN pickup_distance_meters FLOAT")
            )
        if "delivery_distance_meters" not in columns:
            connection.execute(
                text("ALTER TABLE delivery_tasks ADD COLUMN delivery_distance_meters FLOAT")
            )
