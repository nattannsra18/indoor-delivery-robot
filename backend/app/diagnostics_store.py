from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Callable

from .models import DiagnosticStatusPayload


@dataclass
class _StoredDiagnostic:
    status: DiagnosticStatusPayload
    received_at: float


class DiagnosticsStore:
    """Merge ROS diagnostics emitted by independent publishers."""

    def __init__(
        self,
        *,
        clock: Callable[[], float] = time.monotonic,
        stale_after_seconds: float = 5.0,
        expire_after_seconds: float = 60.0,
    ) -> None:
        self._clock = clock
        self._stale_after_seconds = stale_after_seconds
        self._expire_after_seconds = expire_after_seconds
        self._statuses: dict[
            str,
            dict[tuple[str, str], _StoredDiagnostic],
        ] = {}
        self._lock = threading.Lock()

    def update(
        self,
        robot_id: str,
        statuses: list[DiagnosticStatusPayload],
    ) -> list[DiagnosticStatusPayload]:
        now = self._clock()
        with self._lock:
            robot_statuses = self._statuses.setdefault(robot_id, {})
            for status in statuses:
                key = (status.name, status.hardware_id)
                robot_statuses[key] = _StoredDiagnostic(
                    status=status.model_copy(deep=True),
                    received_at=now,
                )
            return self._snapshot_locked(robot_id, now)

    def _snapshot_locked(
        self,
        robot_id: str,
        now: float,
    ) -> list[DiagnosticStatusPayload]:
        robot_statuses = self._statuses.get(robot_id, {})
        expired = [
            key
            for key, stored in robot_statuses.items()
            if now - stored.received_at > self._expire_after_seconds
        ]
        for key in expired:
            robot_statuses.pop(key, None)

        result: list[DiagnosticStatusPayload] = []
        for stored in robot_statuses.values():
            age = now - stored.received_at
            status = stored.status.model_copy(deep=True)
            if (
                age > self._stale_after_seconds
                and status.level != "STALE"
            ):
                status = status.model_copy(
                    update={
                        "level": "STALE",
                        "message": "Diagnostic update is stale",
                    }
                )
            result.append(status)
        return result

    def clear_robot(self, robot_id: str) -> None:
        with self._lock:
            self._statuses.pop(robot_id, None)

    def snapshot(self, robot_id: str) -> list[DiagnosticStatusPayload]:
        with self._lock:
            return self._snapshot_locked(robot_id, self._clock())

    def clear(self) -> None:
        with self._lock:
            self._statuses.clear()


diagnostics_store = DiagnosticsStore()
