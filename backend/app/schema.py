from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_compatibility_migrations(engine: Engine) -> None:
    """Add backward-compatible columns to pre-Alembic databases."""
    inspector = inspect(engine)
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
