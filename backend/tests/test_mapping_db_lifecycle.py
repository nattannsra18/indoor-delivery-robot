import asyncio

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from app.mapping_store import mapping_store
from app.models import MappingPhase, MappingTeleopRequest
from app.routers import mapping as mapping_router


def test_mapping_teleop_releases_database_before_robot_delivery(monkeypatch):
    db = Session(create_engine("sqlite://"))
    delivered = False

    async def capture_delivery(_robot_id: str, _payload: dict):
        nonlocal delivered
        delivered = True
        assert not db.in_transaction()

    try:
        mapping_store.clear()
        assert mapping_store.start("robot01") is not None
        mapping_store.request("robot01", MappingPhase.MAPPING)
        db.execute(text("SELECT 1"))
        assert db.in_transaction()
        monkeypatch.setattr(mapping_router, "_deliver", capture_delivery)

        response = asyncio.run(mapping_router.mapping_teleop(
            MappingTeleopRequest(linear_x=0.16, angular_z=0.0),
            "robot01",
            db,
            None,
        ))

        assert response == {"accepted": True}
        assert delivered
    finally:
        mapping_store.clear()
        db.close()
