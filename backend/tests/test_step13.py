import asyncio

import pytest
from fastapi import BackgroundTasks, HTTPException
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.auth import hash_password
from app.database import Base
from app.db_models import (
    DeliveryTaskORM,
    RobotORM,
    StationORM,
    TaskEventORM,
    UserORM,
)
from app.map_store import map_store
from app.models import (
    DeliveryTaskCreate,
    OccupancyGridPayload,
    RoutePreviewResultMessage,
    TaskPriority,
    TaskRoutePreviewRequest,
    UserRole,
)
from app.route_preview import path_distance, route_preview_coordinator
from app.routers.tasks import create_task, preview_task_route
from app.seed import seed_database
from app.service import DeliveryService
from app.websocket_manager import robot_connection_manager


engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
Session = sessionmaker(bind=engine, expire_on_commit=False)
Base.metadata.create_all(engine)


@pytest.fixture(autouse=True)
def reset_state():
    route_preview_coordinator.clear()
    map_store.clear()
    with Session() as db:
        for model in (
            TaskEventORM,
            DeliveryTaskORM,
            UserORM,
            RobotORM,
            StationORM,
        ):
            db.execute(delete(model))
        db.commit()
        seed_database(db)
        db.add_all([
            UserORM(
                id="admin",
                username="admin",
                password_hash=hash_password("admin-pass", iterations=1000),
                role=UserRole.ADMIN,
            ),
            UserORM(
                id="alice",
                username="alice",
                password_hash=hash_password("alice-pass", iterations=1000),
                role=UserRole.USER,
            ),
        ])
        db.commit()
    map_store.update(OccupancyGridPayload(
        frame_id="map",
        resolution=1.0,
        width=2,
        height=2,
        origin_x=0.0,
        origin_y=0.0,
        origin_yaw=0.0,
        data=[0, 0, 0, 0],
    ))
    yield
    route_preview_coordinator.clear()
    map_store.clear()


def available_result(request_id="preview-request"):
    return RoutePreviewResultMessage.model_validate({
        "type": "route_preview_result",
        "request_id": request_id,
        "status": "available",
        "frame_id": "map",
        "pickup_path": [
            {"x": 0.0, "y": 0.0},
            {"x": 3.0, "y": 4.0},
        ],
        "delivery_path": [
            {"x": 3.0, "y": 4.0},
            {"x": 6.0, "y": 8.0},
        ],
        "detail": "reachable",
    })


def test_path_distance_uses_real_polyline_segments():
    result = available_result()
    assert path_distance(result.pickup_path) == pytest.approx(5.0)
    assert path_distance(result.pickup_path + result.delivery_path[1:]) == pytest.approx(10.0)


def test_preview_coordinator_correlates_only_the_expected_robot(monkeypatch):
    sent = []

    async def fake_send(robot_id, message):
        sent.append((robot_id, message))
        return True

    monkeypatch.setattr(robot_connection_manager, "send_json", fake_send)

    async def scenario():
        pending = asyncio.create_task(route_preview_coordinator.request(
            "robot01",
            {"start": {}, "pickup": {}, "destination": {}},
            timeout_seconds=1.0,
        ))
        await asyncio.sleep(0)
        request_id = sent[0][1]["request_id"]
        result = available_result(request_id)
        assert not route_preview_coordinator.resolve("other-robot", result)
        assert route_preview_coordinator.resolve("robot01", result)
        assert await pending == result

    asyncio.run(scenario())


def test_successful_preview_issues_bound_one_use_validation(monkeypatch):
    async def fake_request(robot_id, command):
        assert robot_id == "robot01"
        assert command["pickup"]["frame_id"] == "map"
        return available_result()

    monkeypatch.setattr(route_preview_coordinator, "request", fake_request)
    monkeypatch.setattr(
        "app.routers.tasks.robot_connection_manager.is_connected",
        lambda robot_id: robot_id == "robot01",
    )

    with Session() as db:
        service = DeliveryService(db)
        alice = db.get(UserORM, "alice")
        preview = asyncio.run(preview_task_route(
            TaskRoutePreviewRequest(
                pickup_station_id="A",
                destination_station_id="B",
            ),
            service,
            alice,
        ))
        assert preview.pickup_distance_meters == pytest.approx(5.0)
        assert preview.delivery_distance_meters == pytest.approx(5.0)
        assert preview.travel_time_seconds == pytest.approx(40.0)
        assert preview.pickup_eta_seconds == pytest.approx(20.0)
        assert preview.destination_eta_seconds == pytest.approx(50.0)
        assert preview.completion_eta_seconds == pytest.approx(62.0)

        payload = DeliveryTaskCreate(
            pickup_station_id="A",
            destination_station_id="B",
            preview_id=preview.preview_id,
        )
        created = asyncio.run(
            create_task(payload, BackgroundTasks(), service, alice)
        )
        assert created.owner_id == "alice"
        assert created.pickup_distance_meters == pytest.approx(5.0)
        assert created.delivery_distance_meters == pytest.approx(5.0)

        with pytest.raises(HTTPException) as reused:
            asyncio.run(
                create_task(payload, BackgroundTasks(), service, alice)
            )
        assert reused.value.status_code == 409


def test_preview_binding_blocks_changed_route_priority_and_owner():
    snapshot = map_store.get()
    assert snapshot is not None
    preview_id = route_preview_coordinator.issue_validation(
        owner_id="alice",
        robot_id="robot01",
        pickup_station_id="A",
        destination_station_id="B",
        priority=TaskPriority.NORMAL,
        map_revision=snapshot.revision,
    )
    assert not route_preview_coordinator.consume_validation(
        preview_id,
        owner_id="admin",
        robot_id="robot01",
        pickup_station_id="A",
        destination_station_id="B",
        priority=TaskPriority.HIGH,
        map_revision=snapshot.revision,
    )
    expired = route_preview_coordinator.issue_validation(
        owner_id="alice",
        robot_id="robot01",
        pickup_station_id="A",
        destination_station_id="B",
        priority=TaskPriority.NORMAL,
        map_revision=snapshot.revision,
        validity_seconds=-1.0,
    )
    assert not route_preview_coordinator.consume_validation(
        expired,
        owner_id="alice",
        robot_id="robot01",
        pickup_station_id="A",
        destination_station_id="B",
        priority=TaskPriority.NORMAL,
        map_revision=snapshot.revision,
    )


def test_missing_preview_and_unreachable_route_are_rejected(monkeypatch):
    async def unreachable(*_args, **_kwargs):
        return RoutePreviewResultMessage.model_validate({
            "type": "route_preview_result",
            "request_id": "request",
            "status": "unreachable",
            "pickup_path": [],
            "delivery_path": [],
            "detail": "No valid path to destination",
        })

    monkeypatch.setattr(route_preview_coordinator, "request", unreachable)
    monkeypatch.setattr(
        "app.routers.tasks.robot_connection_manager.is_connected",
        lambda _robot_id: True,
    )
    with Session() as db:
        service = DeliveryService(db)
        alice = db.get(UserORM, "alice")
        with pytest.raises(HTTPException) as missing:
            asyncio.run(
                create_task(
                    DeliveryTaskCreate(
                        pickup_station_id="A",
                        destination_station_id="B",
                    ),
                    BackgroundTasks(),
                    service,
                    alice,
                )
            )
        assert missing.value.status_code == 409

        with pytest.raises(HTTPException) as blocked:
            asyncio.run(preview_task_route(
                TaskRoutePreviewRequest(
                    pickup_station_id="A",
                    destination_station_id="B",
                ),
                service,
                alice,
            ))
        assert blocked.value.status_code == 422
        assert "No valid path" in blocked.value.detail


def test_user_cannot_preview_high_priority():
    with Session() as db:
        with pytest.raises(HTTPException) as denied:
            asyncio.run(preview_task_route(
                TaskRoutePreviewRequest(
                    pickup_station_id="A",
                    destination_station_id="B",
                    priority=TaskPriority.HIGH,
                ),
                DeliveryService(db),
                db.get(UserORM, "alice"),
            ))
        assert denied.value.status_code == 403
