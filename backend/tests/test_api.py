import os
from pathlib import Path

TEST_DB = Path(__file__).resolve().parent / "phase3_test.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.db_models import DeliveryTaskORM, RobotORM, StationORM
from app.main import app
from app.seed import seed_database

test_engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(
    bind=test_engine,
    autoflush=True,
    expire_on_commit=False,
)

Base.metadata.create_all(bind=test_engine)


def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
client = TestClient(app)


def setup_function():
    with TestingSessionLocal() as db:
        db.execute(delete(DeliveryTaskORM))
        db.execute(delete(RobotORM))
        db.execute(delete(StationORM))
        db.commit()
        seed_database(db)


def test_health_reports_database_connection():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["phase"] == "3"


def test_create_and_complete_delivery():
    create = client.post(
        "/api/tasks",
        json={"pickup_station_id": "A", "destination_station_id": "C"},
    )
    assert create.status_code == 201
    task = create.json()
    assert task["status"] == "GOING_TO_PICKUP"
    task_id = task["id"]

    events = [
        ("ARRIVED_PICKUP", "WAITING_FOR_LOADING"),
        ("CONFIRM_LOADED", "DELIVERING"),
        ("ARRIVED_DESTINATION", "WAITING_FOR_UNLOADING"),
        ("CONFIRM_RECEIVED", "COMPLETED"),
    ]

    for event, expected in events:
        response = client.post(f"/api/tasks/{task_id}/events", json={"event": event})
        assert response.status_code == 200
        assert response.json()["status"] == expected

    overview = client.get("/api/overview").json()
    assert overview["robot"]["state"] == "IDLE"
    assert overview["active_task"] is None


def test_second_task_is_queued_and_auto_dispatches():
    first = client.post(
        "/api/tasks",
        json={"pickup_station_id": "A", "destination_station_id": "C"},
    ).json()
    second = client.post(
        "/api/tasks",
        json={"pickup_station_id": "B", "destination_station_id": "D"},
    ).json()

    assert first["status"] == "GOING_TO_PICKUP"
    assert second["status"] == "QUEUED"

    for event in ["ARRIVED_PICKUP", "CONFIRM_LOADED", "ARRIVED_DESTINATION", "CONFIRM_RECEIVED"]:
        client.post(f"/api/tasks/{first['id']}/events", json={"event": event})

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"


def test_reject_same_pickup_and_destination():
    response = client.post(
        "/api/tasks",
        json={"pickup_station_id": "A", "destination_station_id": "A"},
    )
    assert response.status_code == 422


def test_task_persists_across_database_sessions():
    created = client.post(
        "/api/tasks",
        json={"pickup_station_id": "A", "destination_station_id": "B"},
    ).json()

    # The API request has already closed its SQLAlchemy session. A new request/session
    # still reads the same row from the database.
    fetched = client.get(f"/api/tasks/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]
    assert fetched.json()["pickup_station_id"] == "A"
