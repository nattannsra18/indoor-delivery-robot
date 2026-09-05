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
