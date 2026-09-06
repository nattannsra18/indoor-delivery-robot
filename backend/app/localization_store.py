from __future__ import annotations

from datetime import datetime, timedelta
from threading import Lock
from uuid import uuid4

from .models import (
    AmclLifecycleState,
    LocalizationCommandAction,
    LocalizationHealth,
    LocalizationReason,
    LocalizationStatus,
    RobotLocalizationStatusMessage,
    utc_now,
)


class LocalizationStore:
    """Tracks live Robot Agent localization state and pending commands."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._statuses: dict[str, LocalizationStatus] = {}
        self._deadlines: dict[str, datetime] = {}

    def get(self, robot_id: str) -> LocalizationStatus:
        with self._lock:
            self._expire_locked(robot_id)
            current = self._statuses.get(robot_id)
            if current is None:
                return LocalizationStatus(
                    robot_id=robot_id,
                    health=LocalizationHealth.UNKNOWN,
                    reason=LocalizationReason.NO_POSE,
                    amcl_state=AmclLifecycleState.UNKNOWN,
                    tf_available=False,
                    moving=False,
                    detail="Waiting for localization telemetry",
                    updated_at=utc_now(),
                )
            return current.model_copy(deep=True)

    def request(
        self,
        robot_id: str,
        action: LocalizationCommandAction,
        *,
        timeout_seconds: int = 10,
    ) -> tuple[LocalizationStatus, str] | None:
        with self._lock:
            self._expire_locked(robot_id)
            current = self._statuses.get(robot_id)
            if current is not None and current.pending_command_id is not None:
                return None
            command_id = (
                f"localization-{action.value.lower()}:{robot_id}:{uuid4().hex}"
            )
            base = current or LocalizationStatus(
                robot_id=robot_id,
                health=LocalizationHealth.UNKNOWN,
                reason=LocalizationReason.NO_POSE,
                amcl_state=AmclLifecycleState.UNKNOWN,
                tf_available=False,
                moving=False,
                updated_at=utc_now(),
            )
            updated = base.model_copy(
                update={
                    "pending_command_id": command_id,
                    "detail": "Waiting for Robot Agent confirmation",
                    "updated_at": utc_now(),
                }
            )
            self._statuses[robot_id] = updated
            self._deadlines[robot_id] = utc_now() + timedelta(seconds=timeout_seconds)
            return updated.model_copy(deep=True), command_id

    def apply(
        self,
        message: RobotLocalizationStatusMessage,
    ) -> tuple[LocalizationStatus, bool]:
        with self._lock:
            self._expire_locked(message.robot_id)
            current = self._statuses.get(message.robot_id)
            matched = bool(
                message.command_id
                and current
                and current.pending_command_id == message.command_id
            )
            pending_command_id = (
                None if matched else current.pending_command_id if current else None
            )
            status = LocalizationStatus(
                robot_id=message.robot_id,
                health=message.health,
                reason=message.reason,
                amcl_state=message.amcl_state,
                map_id=message.map_id,
                pose=message.pose,
                pose_age_seconds=message.pose_age_seconds,
                position_uncertainty=message.position_uncertainty,
                yaw_uncertainty=message.yaw_uncertainty,
                tf_available=message.tf_available,
                moving=message.moving,
                recovery_count=message.recovery_count,
                recovery_active=message.recovery_active,
                automatic_scan_active=message.automatic_scan_active,
                automatic_scan_progress=message.automatic_scan_progress,
                detail=message.detail,
                pending_command_id=pending_command_id,
                last_command_id=(
                    message.command_id if matched
                    else current.last_command_id if current else None
                ),
                last_command_action=(
                    message.command_action if matched
                    else current.last_command_action if current else None
                ),
                last_command_succeeded=(
                    message.accepted if matched
                    else current.last_command_succeeded if current else None
                ),
                updated_at=utc_now(),
            )
            self._statuses[message.robot_id] = status
            if matched:
                self._deadlines.pop(message.robot_id, None)
            return status.model_copy(deep=True), matched

    def fail_delivery(self, robot_id: str, command_id: str, detail: str) -> None:
        with self._lock:
            current = self._statuses.get(robot_id)
            if current is None or current.pending_command_id != command_id:
                return
            action = self._action_from_command(command_id)
            self._statuses[robot_id] = current.model_copy(update={
                "pending_command_id": None,
                "last_command_id": command_id,
                "last_command_action": action,
                "last_command_succeeded": False,
                "detail": detail,
                "updated_at": utc_now(),
            })
            self._deadlines.pop(robot_id, None)

    def has_pending(self, robot_id: str) -> bool:
        return self.get(robot_id).pending_command_id is not None

    def mark_offline(self, robot_id: str) -> LocalizationStatus:
        with self._lock:
            current = self._statuses.get(robot_id)
            command_id = current.pending_command_id if current else None
            action = self._action_from_command(command_id) if command_id else (
                current.last_command_action if current else None
            )
            status = LocalizationStatus(
                robot_id=robot_id,
                health=LocalizationHealth.UNKNOWN,
                reason=LocalizationReason.ROBOT_OFFLINE,
                amcl_state=AmclLifecycleState.UNKNOWN,
                tf_available=False,
                moving=False,
                recovery_count=current.recovery_count if current else 0,
                recovery_active=False,
                automatic_scan_active=False,
                automatic_scan_progress=0.0,
                detail="Robot Agent is offline",
                last_command_id=command_id or (current.last_command_id if current else None),
                last_command_action=action,
                last_command_succeeded=False if command_id else (
                    current.last_command_succeeded if current else None
                ),
                updated_at=utc_now(),
            )
            self._statuses[robot_id] = status
            self._deadlines.pop(robot_id, None)
            return status.model_copy(deep=True)

    def clear(self) -> None:
        with self._lock:
            self._statuses.clear()
            self._deadlines.clear()

    def _expire_locked(self, robot_id: str) -> None:
        deadline = self._deadlines.get(robot_id)
        if deadline is None or deadline > utc_now():
            return
        current = self._statuses.get(robot_id)
        if current is not None and current.pending_command_id is not None:
            command_id = current.pending_command_id
            self._statuses[robot_id] = current.model_copy(update={
                "pending_command_id": None,
                "last_command_id": command_id,
                "last_command_action": self._action_from_command(command_id),
                "last_command_succeeded": False,
                "detail": "Robot acknowledgement timed out",
                "updated_at": utc_now(),
            })
        self._deadlines.pop(robot_id, None)

    @staticmethod
    def _action_from_command(command_id: str) -> LocalizationCommandAction:
        return (
            LocalizationCommandAction.GLOBAL_LOCALIZATION
            if "global_localization" in command_id
            else LocalizationCommandAction.SET_INITIAL_POSE
        )


localization_store = LocalizationStore()
