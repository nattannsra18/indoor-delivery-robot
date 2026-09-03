from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def apply_compatibility_migrations(engine: Engine) -> None:
    """Add the sole nullable Step 9 column to pre-Alembic databases."""
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
