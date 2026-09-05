from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import require_admin, require_user
from ..database import get_db
from ..db_models import MapMetadataORM, UserORM

from ..map_store import map_store
from ..models import (
    MapCatalogAction,
    MapCatalogOperation,
    MapMetadata,
    MapMetadataUpdate,
    MapSnapshot,
    MapSwitchOperation,
    RobotMapCatalog,
    RobotMapDetailsUpdate,
    RobotMapRenameRequest,
    RobotState,
    utc_now,
)
from ..map_catalog_store import map_catalog_store
from ..map_switch_store import map_switch_store
from ..map_catalog_operation_store import map_catalog_operation_store
from ..service import DeliveryService
from ..config import security_settings
from ..websocket_manager import robot_connection_manager

router = APIRouter(
    prefix="/api/map",
    tags=["map"], dependencies=[Depends(require_user)],
)


@router.get("/metadata", response_model=MapMetadata)
def get_map_metadata(db: Session = Depends(get_db)) -> MapMetadataORM:
    metadata = db.get(MapMetadataORM, "active")
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Map metadata has not been configured",
        )
    return metadata


@router.put("/metadata", response_model=MapMetadata)
def update_map_metadata(
    payload: MapMetadataUpdate,
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MapMetadataORM:
    metadata = db.get(MapMetadataORM, "active")
    if metadata is None:
        metadata = MapMetadataORM(id="active", **payload.model_dump())
        db.add(metadata)
    else:
        for field, value in payload.model_dump().items():
            setattr(metadata, field, value)
        metadata.updated_at = utc_now()
    AuditService(db).log(user.id, "map.metadata_updated", "map", "active")
    db.commit()
    db.refresh(metadata)
    return metadata


@router.get("", response_model=MapSnapshot)
def get_map() -> MapSnapshot:
    snapshot = map_store.get()

    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ROS map has not been received",
        )

    return snapshot


@router.get("/catalog", response_model=RobotMapCatalog)
def get_map_catalog(
    robot_id: str = "robot01",
    _: UserORM = Depends(require_admin),
) -> RobotMapCatalog:
    catalog = map_catalog_store.get(
        robot_id,
        robot_online=robot_connection_manager.is_connected(robot_id),
    )
    if catalog is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Robot Agent has not reported its map catalog",
        )
    return catalog


@router.post("/catalog/refresh", status_code=status.HTTP_202_ACCEPTED)
async def refresh_map_catalog(
    robot_id: str = "robot01",
    _: UserORM = Depends(require_admin),
) -> dict[str, bool | str]:
    delivered = await robot_connection_manager.send_json(
        robot_id,
        {"type": "map_catalog_request"},
    )
    if not delivered:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Robot Agent is offline",
        )
    return {"accepted": True, "robot_id": robot_id}


def _catalog_map(robot_id: str, map_id: str):
    catalog = map_catalog_store.get(
        robot_id,
        robot_online=robot_connection_manager.is_connected(robot_id),
    )
    if catalog is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Robot Agent has not reported its map catalog",
        )
    selected = next((item for item in catalog.maps if item.id == map_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Map not found on the robot")
    if not catalog.robot_online:
        raise HTTPException(status_code=503, detail="Robot Agent is offline")
    return catalog, selected


def _require_idle_robot(db: Session, robot_id: str) -> None:
    service = DeliveryService(db)
    robot = service.get_robot(robot_id)
    if (
        not robot.online
        or robot.state != RobotState.IDLE
        or robot.current_task_id is not None
        or service.active_task_for_robot(robot_id) is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="Robot must be online and idle with no active mission",
        )


async def _send_catalog_operation(
    *,
    robot_id: str,
    map_id: str,
    action: MapCatalogAction,
    command: dict,
    db: Session,
    user: UserORM,
) -> MapCatalogOperation:
    if map_switch_store.has_pending(robot_id):
        raise HTTPException(status_code=409, detail="A map switch is pending")
    operation = map_catalog_operation_store.begin(
        robot_id,
        map_id,
        action,
        timeout_seconds=security_settings().map_command_timeout_seconds,
    )
    if operation is None:
        raise HTTPException(status_code=409, detail="Another map edit is pending")
    AuditService(db).log(
        user.id,
        f"map.{action.value.lower()}_requested",
        "map",
        map_id,
        {"robot_id": robot_id, "map_id": map_id, "command_id": operation.command_id},
    )
    db.commit()
    delivered = await robot_connection_manager.send_json(robot_id, {
        "type": "map_catalog_command",
        "command_id": operation.command_id,
        "robot_id": robot_id,
        "map_id": map_id,
        "action": action.value,
        **command,
    })
    if not delivered:
        failed, _ = map_catalog_operation_store.complete(
            operation.command_id,
            robot_id,
            map_id,
            action,
            accepted=False,
            result_map_id=None,
            detail="Robot Agent is offline",
        )
        assert failed is not None
        return failed
    return operation


@router.put(
    "/catalog/{map_id}/metadata",
    response_model=MapCatalogOperation,
    status_code=status.HTTP_202_ACCEPTED,
)
async def update_catalog_map_metadata(
    map_id: str,
    payload: RobotMapDetailsUpdate,
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MapCatalogOperation:
    _catalog_map(robot_id, map_id)
    return await _send_catalog_operation(
        robot_id=robot_id,
        map_id=map_id,
        action=MapCatalogAction.UPDATE_METADATA,
        command={"metadata": payload.model_dump()},
        db=db,
        user=user,
    )


@router.post(
    "/catalog/{map_id}/rename",
    response_model=MapCatalogOperation,
    status_code=status.HTTP_202_ACCEPTED,
)
async def rename_catalog_map(
    map_id: str,
    payload: RobotMapRenameRequest,
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MapCatalogOperation:
    catalog, selected = _catalog_map(robot_id, map_id)
    if selected.active:
        raise HTTPException(status_code=409, detail="The active map cannot be renamed")
    if any(item.id == payload.new_map_id for item in catalog.maps):
        raise HTTPException(status_code=409, detail="The new map ID already exists")
    _require_idle_robot(db, robot_id)
    return await _send_catalog_operation(
        robot_id=robot_id,
        map_id=map_id,
        action=MapCatalogAction.RENAME,
        command={"new_map_id": payload.new_map_id},
        db=db,
        user=user,
    )


@router.delete(
    "/catalog/{map_id}",
    response_model=MapCatalogOperation,
    status_code=status.HTTP_202_ACCEPTED,
)
async def delete_catalog_map(
    map_id: str,
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MapCatalogOperation:
    _, selected = _catalog_map(robot_id, map_id)
    if selected.active:
        raise HTTPException(status_code=409, detail="The active map cannot be deleted")
    _require_idle_robot(db, robot_id)
    return await _send_catalog_operation(
        robot_id=robot_id,
        map_id=map_id,
        action=MapCatalogAction.DELETE,
        command={},
        db=db,
        user=user,
    )


@router.get(
    "/catalog-operations/{command_id}",
    response_model=MapCatalogOperation,
)
def get_catalog_operation(
    command_id: str,
    _: UserORM = Depends(require_admin),
) -> MapCatalogOperation:
    operation = map_catalog_operation_store.get(command_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Map operation not found")
    return operation


@router.post(
    "/catalog/{map_id}/activate",
    response_model=MapSwitchOperation,
    status_code=status.HTTP_202_ACCEPTED,
)
async def activate_map(
    map_id: str,
    robot_id: str = "robot01",
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MapSwitchOperation:
    if map_catalog_operation_store.has_pending(robot_id):
        raise HTTPException(status_code=409, detail="A map edit is pending")
    catalog = map_catalog_store.get(
        robot_id,
        robot_online=robot_connection_manager.is_connected(robot_id),
    )
    if catalog is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The Robot Agent has not reported its map catalog",
        )
    selected = next((item for item in catalog.maps if item.id == map_id), None)
    if selected is None:
        raise HTTPException(status_code=404, detail="Map not found on the robot")
    if not selected.available:
        raise HTTPException(status_code=409, detail="Map files are not ready")
    if selected.active:
        raise HTTPException(status_code=409, detail="Map is already active")

    service = DeliveryService(db)
    robot = service.get_robot(robot_id)
    if (
        not robot.online
        or not catalog.robot_online
        or robot.state != RobotState.IDLE
        or robot.current_task_id is not None
        or service.active_task_for_robot(robot_id) is not None
    ):
        raise HTTPException(
            status_code=409,
            detail="Robot must be online and idle with no active mission",
        )

    operation = map_switch_store.begin(
        robot_id,
        map_id,
        timeout_seconds=security_settings().map_command_timeout_seconds,
    )
    if operation is None:
        raise HTTPException(
            status_code=409,
            detail="Another map switch is already pending",
        )

    AuditService(db).log(
        user.id,
        "map.switch_requested",
        "map",
        map_id,
        {
            "robot_id": robot_id,
            "map_id": map_id,
            "command_id": operation.command_id,
        },
    )
    db.commit()
    delivered = await robot_connection_manager.send_json(
        robot_id,
        {
            "type": "map_command",
            "command": "switch_map",
            "command_id": operation.command_id,
            "robot_id": robot_id,
            "map_id": map_id,
        },
    )
    if not delivered:
        failed, _ = map_switch_store.complete(
            operation.command_id,
            robot_id,
            map_id,
            accepted=False,
            detail="Robot Agent is offline",
        )
        AuditService(db).log(
            None,
            "map.switch_failed",
            "map",
            map_id,
            {"robot_id": robot_id, "map_id": map_id},
            result="failed",
        )
        db.commit()
        assert failed is not None
        return failed
    return operation


@router.get(
    "/operations/{command_id}",
    response_model=MapSwitchOperation,
)
def get_map_operation(
    command_id: str,
    _: UserORM = Depends(require_admin),
) -> MapSwitchOperation:
    operation = map_switch_store.get(command_id)
    if operation is None:
        raise HTTPException(status_code=404, detail="Map operation not found")
    return operation
