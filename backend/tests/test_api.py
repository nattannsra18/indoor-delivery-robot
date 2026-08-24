import os
from pathlib import Path

TEST_DB = Path(__file__).resolve().parent / "phase4_test.db"
TEST_DATABASE_URL = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker

from app.database import Base, get_db
from app.db_models import DeliveryTaskORM, RobotORM, StationORM, TaskEventORM
from app.main import app
from app.seed import seed_database

if TEST_DB.exists():
    TEST_DB.unlink()

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
        db.execute(delete(TaskEventORM))
        db.execute(delete(DeliveryTaskORM))
        db.execute(delete(RobotORM))
        db.execute(delete(StationORM))
        db.commit()
        seed_database(db)


def create_task(pickup="A", destination="C"):
    response = client.post(
        "/api/tasks",
        json={"pickup_station_id": pickup, "destination_station_id": destination},
    )
    assert response.status_code == 201
    return response.json()


def advance(task_id: str, event: str):
    return client.post(
        f"/api/tasks/{task_id}/events",
        json={"event": event, "source": "WEB_SIMULATOR"},
    )


def test_health_reports_phase4_state_machine():
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["database"] == "connected"
    assert body["phase"] == "4"
    assert body["workflow"] == "state-machine"


def test_create_complete_and_history_is_persisted():
    task = create_task()
    assert task["status"] == "GOING_TO_PICKUP"
    task_id = task["id"]

    transitions = [
        ("ARRIVED_PICKUP", "WAITING_FOR_LOADING"),
        ("CONFIRM_LOADED", "DELIVERING"),
        ("ARRIVED_DESTINATION", "WAITING_FOR_UNLOADING"),
        ("CONFIRM_RECEIVED", "COMPLETED"),
    ]
    for event, expected in transitions:
        response = advance(task_id, event)
        assert response.status_code == 200
        assert response.json()["status"] == expected

    history = client.get(f"/api/tasks/{task_id}/history")
    assert history.status_code == 200
    event_types = [item["event_type"] for item in history.json()]
    assert event_types == [
        "TASK_CREATED",
        "TASK_ASSIGNED",
        "ARRIVED_PICKUP",
        "CONFIRM_LOADED",
        "ARRIVED_DESTINATION",
        "CONFIRM_RECEIVED",
    ]

    overview = client.get("/api/overview").json()
    assert overview["robot"]["state"] == "IDLE"
    assert overview["active_task"] is None


def test_invalid_transition_is_rejected():
    task = create_task()
    response = advance(task["id"], "CONFIRM_LOADED")
    assert response.status_code == 409
    assert "Allowed events" in response.json()["detail"]

    current = client.get(f"/api/tasks/{task['id']}").json()
    assert current["status"] == "GOING_TO_PICKUP"


def test_second_task_is_queued_and_auto_dispatches():
    first = create_task("A", "C")
    second = create_task("B", "D")

    assert first["status"] == "GOING_TO_PICKUP"
    assert second["status"] == "QUEUED"

    for event in ["ARRIVED_PICKUP", "CONFIRM_LOADED", "ARRIVED_DESTINATION", "CONFIRM_RECEIVED"]:
        response = advance(first["id"], event)
        assert response.status_code == 200

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"
    assert second_after["robot_id"] == "robot01"


def test_cancel_active_task_dispatches_next_queued_task():
    first = create_task("A", "C")
    second = create_task("B", "D")

    cancel = client.post(f"/api/tasks/{first['id']}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] == "CANCELLED"

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"


def test_navigation_failure_and_retry():
    task = create_task("A", "C")

    failed = advance(task["id"], "NAVIGATION_FAILED")
    assert failed.status_code == 200
    assert failed.json()["status"] == "FAILED"

    robot = client.get("/api/robots/robot01").json()
    assert robot["state"] == "ERROR"
    assert robot["current_task_id"] == task["id"]

    retried = client.post(f"/api/tasks/{task['id']}/retry")
    assert retried.status_code == 200
    assert retried.json()["status"] == "GOING_TO_PICKUP"

    robot_after = client.get("/api/robots/robot01").json()
    assert robot_after["state"] == "GOING_TO_PICKUP"
    assert robot_after["current_task_id"] == task["id"]


def test_robot_offline_fails_active_task_and_online_dispatches_queue():
    first = create_task("A", "C")
    second = create_task("B", "D")

    offline = client.post("/api/robots/robot01/offline")
    assert offline.status_code == 200
    assert offline.json()["state"] == "OFFLINE"
    assert offline.json()["online"] is False

    first_after = client.get(f"/api/tasks/{first['id']}").json()
    assert first_after["status"] == "FAILED"

    second_before = client.get(f"/api/tasks/{second['id']}").json()
    assert second_before["status"] == "QUEUED"

    online = client.post("/api/robots/robot01/online")
    assert online.status_code == 200
    assert online.json()["online"] is True

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"


def test_recover_robot_after_error_dispatches_queued_task():
    first = create_task("A", "C")
    second = create_task("B", "D")
    advance(first["id"], "NAVIGATION_FAILED")

    recover = client.post("/api/robots/robot01/recover")
    assert recover.status_code == 200

    second_after = client.get(f"/api/tasks/{second['id']}").json()
    assert second_after["status"] == "GOING_TO_PICKUP"


def test_reject_same_pickup_and_destination():
    response = client.post(
        "/api/tasks",
        json={"pickup_station_id": "A", "destination_station_id": "A"},
    )
    assert response.status_code == 422


def test_task_persists_across_database_sessions():
    created = create_task("A", "B")
    fetched = client.get(f"/api/tasks/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]
    assert fetched.json()["pickup_station_id"] == "A"
