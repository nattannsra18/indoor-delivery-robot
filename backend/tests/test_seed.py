from unittest.mock import Mock

from app.seed import seed_database


def test_seed_database_skips_demo_records_in_production() -> None:
    db = Mock()

    seed_database(db, app_env="production")

    db.assert_not_called()
    assert db.method_calls == []
