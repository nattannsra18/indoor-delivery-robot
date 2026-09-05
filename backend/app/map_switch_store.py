from __future__ import annotations

from datetime import timedelta
from threading import Lock
from uuid import uuid4

from .models import MapSwitchOperation, MapSwitchStatus, utc_now


class MapSwitchStore:
    """Tracks acknowledged map switches without owning ROS map state."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._operations: dict[str, MapSwitchOperation] = {}
        self._pending_by_robot: dict[str, str] = {}

    def begin(
        self,
        robot_id: str,
        map_id: str,
        *,
        timeout_seconds: int,
    ) -> MapSwitchOperation | None:
        with self._lock:
            self._expire_locked()
            if robot_id in self._pending_by_robot:
                return None
            now = utc_now()
            operation = MapSwitchOperation(
                command_id=f"map-switch:{robot_id}:{uuid4().hex}",
                robot_id=robot_id,
                map_id=map_id,
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
        *,
        accepted: bool,
        detail: str | None,
    ) -> tuple[MapSwitchOperation | None, bool]:
        with self._lock:
            self._expire_locked()
            operation = self._operations.get(command_id)
            if (
                operation is None
                or operation.status != MapSwitchStatus.PENDING
                or operation.robot_id != robot_id
                or operation.map_id != map_id
            ):
                return operation.model_copy(deep=True) if operation else None, False
            updated = operation.model_copy(
                update={
                    "status": (
                        MapSwitchStatus.SUCCEEDED
                        if accepted else MapSwitchStatus.FAILED
                    ),
                    "detail": detail,
                    "completed_at": utc_now(),
                }
            )
            self._operations[command_id] = updated
            self._pending_by_robot.pop(robot_id, None)
            return updated.model_copy(deep=True), True

    def get(self, command_id: str) -> MapSwitchOperation | None:
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
            self._operations[command_id] = operation.model_copy(
                update={
                    "status": MapSwitchStatus.FAILED,
                    "detail": "Robot acknowledgement timed out",
                    "completed_at": now,
                }
            )
            self._pending_by_robot.pop(operation.robot_id, None)


map_switch_store = MapSwitchStore()
