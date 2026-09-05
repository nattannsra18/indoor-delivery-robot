from __future__ import annotations

from threading import Lock

from .models import RobotMapCatalog, RobotMapCatalogPayload, utc_now


class MapCatalogStore:
    """Keeps Robot Agent map catalogs in memory without becoming their source."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._catalogs: dict[str, RobotMapCatalog] = {}

    def update(self, payload: RobotMapCatalogPayload) -> RobotMapCatalog:
        catalog = RobotMapCatalog(
            **payload.model_dump(exclude={"type"}),
            received_at=utc_now(),
            robot_online=True,
        )
        with self._lock:
            self._catalogs[payload.robot_id] = catalog
        return catalog.model_copy(deep=True)

    def get(self, robot_id: str, *, robot_online: bool) -> RobotMapCatalog | None:
        with self._lock:
            catalog = self._catalogs.get(robot_id)
            if catalog is None:
                return None
            return catalog.model_copy(update={"robot_online": robot_online}, deep=True)

    def set_active(self, robot_id: str, map_id: str) -> RobotMapCatalog | None:
        with self._lock:
            catalog = self._catalogs.get(robot_id)
            if catalog is None or not any(item.id == map_id for item in catalog.maps):
                return None
            updated = catalog.model_copy(
                update={
                    "active_map_id": map_id,
                    "maps": [
                        item.model_copy(update={"active": item.id == map_id})
                        for item in catalog.maps
                    ],
                    "received_at": utc_now(),
                    "robot_online": True,
                },
                deep=True,
            )
            self._catalogs[robot_id] = updated
            return updated.model_copy(deep=True)

    def clear(self) -> None:
        with self._lock:
            self._catalogs.clear()


map_catalog_store = MapCatalogStore()
