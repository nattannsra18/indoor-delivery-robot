from __future__ import annotations

from threading import Lock
from uuid import uuid4

from .models import (
    NavigationFailureCategory,
    RobotOperation,
    RobotOperationAction,
    RobotOperationStatus,
    utc_now,
)


_LIFECYCLE_STATUS = {
    "accepted": RobotOperationStatus.ACCEPTED,
    "started": RobotOperationStatus.RUNNING,
    "succeeded": RobotOperationStatus.SUCCEEDED,
    "rejected": RobotOperationStatus.FAILED,
    "failed": RobotOperationStatus.FAILED,
}


class RobotOperationStore:
    """Tracks privileged robot operations acknowledged by the Robot Agent."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._operations: dict[str, RobotOperation] = {}
        self._latest_by_robot: dict[str, str] = {}

    def begin(self, robot_id: str, action: RobotOperationAction) -> RobotOperation:
        now = utc_now()
        operation = RobotOperation(
            command_id=f"robot-op:{robot_id}:{uuid4().hex}",
            robot_id=robot_id,
            action=action,
            status=RobotOperationStatus.PENDING,
            requested_at=now,
            updated_at=now,
        )
        with self._lock:
            self._operations[operation.command_id] = operation
            self._latest_by_robot[robot_id] = operation.command_id
        return operation.model_copy(deep=True)

    def update(
        self,
        command_id: str,
        robot_id: str,
        lifecycle: str,
        detail: str | None,
    ) -> RobotOperation | None:
        with self._lock:
            current = self._operations.get(command_id)
            if current is None or current.robot_id != robot_id:
                return None
            category = None
            for candidate in NavigationFailureCategory:
                if detail and candidate.value.lower() in detail.lower():
                    category = candidate
                    break
            updated = current.model_copy(update={
                "status": _LIFECYCLE_STATUS[lifecycle],
                "detail": detail,
                "failure_category": category,
                "updated_at": utc_now(),
            })
            self._operations[command_id] = updated
            return updated.model_copy(deep=True)

    def latest(self, robot_id: str) -> RobotOperation | None:
        with self._lock:
            command_id = self._latest_by_robot.get(robot_id)
            operation = self._operations.get(command_id) if command_id else None
            return operation.model_copy(deep=True) if operation else None

    def mark_delivery_failed(self, command_id: str, detail: str) -> None:
        with self._lock:
            current = self._operations.get(command_id)
            if current is None:
                return
            self._operations[command_id] = current.model_copy(update={
                "status": RobotOperationStatus.FAILED,
                "detail": detail,
                "updated_at": utc_now(),
            })

    def clear(self) -> None:
        with self._lock:
            self._operations.clear()
            self._latest_by_robot.clear()


robot_operation_store = RobotOperationStore()
