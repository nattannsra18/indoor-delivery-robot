import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.db_models import StationORM
from app.map_catalog_store import map_catalog_store
from app.map_store import map_store
from app.models import DeliveryTaskCreate, OccupancyGridPayload, StationCreate
from app.seed import seed_database
from app.schema import apply_compatibility_migrations
from app.service import DeliveryService


@pytest.fixture()
def service():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session_factory = sessionmaker(bind=engine, expire_on_commit=False)
    map_catalog_store.clear()
    map_store.clear()
    map_store.update(OccupancyGridPayload(
        frame_id="map",
        resolution=1.0,
        width=2,
        height=2,
        origin_x=0.0,
        origin_y=0.0,
        origin_yaw=0.0,
        data=[0, 100, -1, 0],
    ))
    with session_factory() as db:
        seed_database(db)
        yield DeliveryService(db)
    map_catalog_store.clear()
    map_store.clear()
    engine.dispose()


def station_payload(**values):
    return StationCreate(
        map_id=values.get("map_id", "warehouse_map"),
        name=values.get("name", "Reception"),
        x=values.get("x", 0.5),
        y=values.get("y", 0.5),
        yaw=values.get("yaw", 0.0),
    )


def test_stations_are_scoped_to_the_selected_map(service):
    created = service.add_station(station_payload())
    service.repo.add_station(StationORM(
        id="OTHER",
        map_id="second_map",
        name="Other map station",
        x=1.5,
        y=1.5,
        yaw=0.0,
    ))
    service.db.commit()

    assert created.map_id == "warehouse_map"
    assert created.id in {station.id for station in service.list_stations()}
    assert "OTHER" not in {station.id for station in service.list_stations()}
    assert [station.id for station in service.list_stations("second_map")] == ["OTHER"]


@pytest.mark.parametrize(
    ("x", "y", "detail"),
    [
        (1.5, 0.5, "Station must be placed in known free space"),
        (0.5, 1.5, "Station must be placed in known free space"),
        (2.5, 0.5, "Station position is outside the active map"),
    ],
)
def test_station_pose_must_be_known_free_space(service, x, y, detail):
    with pytest.raises(HTTPException) as caught:
        service.add_station(station_payload(x=x, y=y))
    assert caught.value.status_code == 422
    assert caught.value.detail == detail


def test_station_edit_and_delivery_cannot_cross_the_active_map(service):
    with pytest.raises(HTTPException) as caught:
        service.add_station(station_payload(map_id="second_map"))
    assert caught.value.status_code == 409

    service.get_station("B").map_id = "second_map"
    service.db.commit()
    with pytest.raises(HTTPException) as caught:
        service.create_task(DeliveryTaskCreate(
            pickup_station_id="A",
            destination_station_id="B",
        ))
    assert caught.value.status_code == 409
    assert caught.value.detail == "Pickup and destination must belong to the same map"


def test_station_with_completed_history_is_soft_deleted(service):
    historical_task = service.get_task("TASK-001")

    service.delete_station("A")

    assert "A" not in {station.id for station in service.list_stations()}
    assert service.repo.get_station("A").active is False
    assert service.get_task("TASK-001").id == historical_task.id


def test_station_used_by_open_delivery_cannot_be_deleted(service):
    task = service.create_task(DeliveryTaskCreate(
        pickup_station_id="A",
        destination_station_id="B",
    ))

    with pytest.raises(HTTPException) as caught:
        service.delete_station("B")

    assert task.status.value in {"QUEUED", "GOING_TO_PICKUP"}
    assert caught.value.status_code == 409
    assert caught.value.detail == (
        "Station is used by an active or queued delivery task"
    )
    assert service.get_station("B").active is True


def test_compatibility_migration_adds_station_active_column():
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE stations (
                id VARCHAR(20) PRIMARY KEY,
                map_id VARCHAR(120) NOT NULL DEFAULT 'warehouse_map',
                name VARCHAR(100) NOT NULL,
                x FLOAT NOT NULL,
                y FLOAT NOT NULL,
                yaw FLOAT NOT NULL,
                description VARCHAR(200),
                location VARCHAR(200),
                instructions VARCHAR(400)
            )
        """))
        connection.execute(text("""
            INSERT INTO stations (id, name, x, y, yaw)
            VALUES ('LEGACY', 'Legacy station', 0, 0, 0)
        """))

    apply_compatibility_migrations(engine)
    apply_compatibility_migrations(engine)

    columns = {item["name"] for item in inspect(engine).get_columns("stations")}
    with engine.connect() as connection:
        active = connection.scalar(text(
            "SELECT active FROM stations WHERE id = 'LEGACY'"
        ))
    assert "active" in columns
    assert bool(active) is True
    engine.dispose()
