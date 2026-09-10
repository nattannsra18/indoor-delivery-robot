from __future__ import annotations

from threading import Lock

from .models import (
    MapSnapshot,
    OccupancyGridPayload,
    utc_now,
)


class MapStore:
    def __init__(self) -> None:
        self._lock = Lock()
        self._revisions: dict[str, int] = {}
        self._snapshots: dict[str, MapSnapshot] = {}

    def update(
        self,
        payload: OccupancyGridPayload,
        *,
        robot_id: str = "robot01",
    ) -> MapSnapshot:
        with self._lock:
            revision = self._revisions.get(robot_id, 0) + 1
            self._revisions[robot_id] = revision
            snapshot = MapSnapshot(
                **payload.model_dump(),
                revision=revision,
                received_at=utc_now(),
            )
            self._snapshots[robot_id] = snapshot
            return snapshot.model_copy(deep=True)

    def get(self, robot_id: str = "robot01") -> MapSnapshot | None:
        with self._lock:
            snapshot = self._snapshots.get(robot_id)
            if snapshot is None:
                return None

            return snapshot.model_copy(deep=True)

    def clear(self, robot_id: str | None = None) -> None:
        with self._lock:
            if robot_id is None:
                self._revisions.clear()
                self._snapshots.clear()
                return
            self._revisions.pop(robot_id, None)
            self._snapshots.pop(robot_id, None)


map_store = MapStore()
