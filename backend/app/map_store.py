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
        self._revision = 0
        self._snapshot: MapSnapshot | None = None

    def update(
        self,
        payload: OccupancyGridPayload,
    ) -> MapSnapshot:
        with self._lock:
            self._revision += 1
            self._snapshot = MapSnapshot(
                **payload.model_dump(),
                revision=self._revision,
                received_at=utc_now(),
            )
            return self._snapshot.model_copy(deep=True)

    def get(self) -> MapSnapshot | None:
        with self._lock:
            if self._snapshot is None:
                return None

            return self._snapshot.model_copy(deep=True)

    def clear(self) -> None:
        with self._lock:
            self._revision = 0
            self._snapshot = None


map_store = MapStore()
