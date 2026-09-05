from sqlalchemy.dialects import postgresql

from app.repository import DeliveryRepository


class CapturingSession:
    def __init__(self) -> None:
        self.statement = None

    def scalar(self, statement):
        self.statement = statement
        return None


def test_queue_lock_targets_only_delivery_tasks_without_owner_outer_join():
    session = CapturingSession()

    assert DeliveryRepository(session).next_queued_task_for_update() is None
    assert session.statement is not None

    sql = str(
        session.statement.compile(
            dialect=postgresql.dialect(),
            compile_kwargs={"literal_binds": True},
        )
    )

    assert "LEFT OUTER JOIN users" not in sql
    assert "FOR UPDATE OF delivery_tasks" in sql
