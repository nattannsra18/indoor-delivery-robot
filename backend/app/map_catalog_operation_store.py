from __future__ import annotations

from datetime import timedelta
from threading import Lock
from uuid import uuid4

from .models import (
    MapCatalogAction,
    MapCatalogOperation,
    MapSwitchStatus,
    utc_now,
)


class MapCatalogOperationStore:
    """Tracks robot-acknowledged filesystem mutations for map files."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._operations: dict[str, MapCatalogOperation] = {}
        self._pending_by_robot: dict[str, str] = {}

    def begin(
        self,
        robot_id: str,
        map_id: str,
        action: MapCatalogAction,
        *,
        timeout_seconds: int,
    ) -> MapCatalogOperation | None:
        with self._lock:
            self._expire_locked()
            if robot_id in self._pending_by_robot:
                return None
            now = utc_now()
            operation = MapCatalogOperation(
                command_id=f"map-catalog:{robot_id}:{uuid4().hex}",
                robot_id=robot_id,
                map_id=map_id,
                action=action,
                status=MapSwitchStatus.PENDING,
                requested_at=now,
                deadline=now + timedelta(seconds=timeout_seconds),
            )
            self._operations[operation.command_id] = operation
            self._pending_by_robot[robot_id] = operation.command_id
            return operation.model_copy(deep=True)

    def complete(
        self,
        command_id: str,
        robot_id: str,
        map_id: str,
        action: MapCatalogAction,
        *,
        accepted: bool,
        result_map_id: str | None,
        detail: str | None,
    ) -> tuple[MapCatalogOperation | None, bool]:
        with self._lock:
            self._expire_locked()
            operation = self._operations.get(command_id)
            if (
                operation is None
                or operation.status != MapSwitchStatus.PENDING
                or operation.robot_id != robot_id
                or operation.map_id != map_id
                or operation.action != action
            ):
                return operation.model_copy(deep=True) if operation else None, False
            updated = operation.model_copy(update={
                "status": MapSwitchStatus.SUCCEEDED if accepted else MapSwitchStatus.FAILED,
                "result_map_id": result_map_id,
                "detail": detail,
                "completed_at": utc_now(),
            })
            self._operations[command_id] = updated
            self._pending_by_robot.pop(robot_id, None)
            return updated.model_copy(deep=True), True

    def get(self, command_id: str) -> MapCatalogOperation | None:
        with self._lock:
            self._expire_locked()
            operation = self._operations.get(command_id)
            return operation.model_copy(deep=True) if operation else None

    def has_pending(self, robot_id: str) -> bool:
        with self._lock:
            self._expire_locked()
            return robot_id in self._pending_by_robot

    def clear(self) -> None:
        with self._lock:
            self._operations.clear()
            self._pending_by_robot.clear()

    def _expire_locked(self) -> None:
        now = utc_now()
        for command_id, operation in list(self._operations.items()):
            if operation.status != MapSwitchStatus.PENDING or operation.deadline > now:
                continue
            self._operations[command_id] = operation.model_copy(update={
                "status": MapSwitchStatus.FAILED,
                "detail": "Robot acknowledgement timed out",
                "completed_at": now,
            })
            self._pending_by_robot.pop(operation.robot_id, None)


map_catalog_operation_store = MapCatalogOperationStore()
