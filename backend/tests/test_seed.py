from unittest.mock import Mock

from app.db_models import RobotORM
from app.seed import seed_database


def test_seed_database_skips_demo_records_in_production() -> None:
    db = Mock()

    seed_database(db, app_env="production")

    db.assert_not_called()
    assert db.method_calls == []


def test_seed_database_does_not_create_legacy_robot_by_default() -> None:
    db = Mock()
    db.scalar.return_value = "existing"

    seed_database(db)

    assert all(
        call.args != (RobotORM, "robot01")
        for call in db.get.call_args_list
    )
