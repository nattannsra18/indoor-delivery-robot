from __future__ import annotations

import asyncio
from dataclasses import dataclass
import math
from threading import RLock
import time
from typing import Any
from uuid import uuid4

from .models import (
    NavigationPathPose,
    RoutePreviewResultMessage,
    TaskPriority,
)
from .websocket_manager import robot_connection_manager


PREVIEW_TIMEOUT_SECONDS = 10.0
PREVIEW_VALIDITY_SECONDS = 60.0
PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND = 0.25
PREVIEW_LOADING_SECONDS = 10.0
PREVIEW_UNLOADING_SECONDS = 12.0


class RoutePreviewUnavailableError(RuntimeError):
    pass


@dataclass(frozen=True)
class _PendingPreview:
    robot_id: str
    future: asyncio.Future[RoutePreviewResultMessage]


@dataclass(frozen=True)
class PreviewValidation:
    owner_id: str
    robot_id: str
    pickup_station_id: str
    destination_station_id: str
    priority: TaskPriority
    map_revision: int
    expires_at: float
    pickup_distance_meters: float | None = None
    delivery_distance_meters: float | None = None


class RoutePreviewCoordinator:
    """Correlates HTTP preview requests with Robot WebSocket results."""

    def __init__(self) -> None:
        self._lock = RLock()
        self._pending: dict[str, _PendingPreview] = {}
        self._validations: dict[str, PreviewValidation] = {}

    async def request(
        self,
        robot_id: str,
        command: dict[str, Any],
        *,
        timeout_seconds: float = PREVIEW_TIMEOUT_SECONDS,
    ) -> RoutePreviewResultMessage:
        request_id = str(uuid4())
        future = asyncio.get_running_loop().create_future()
        with self._lock:
            self._pending[request_id] = _PendingPreview(robot_id, future)

        sent = await robot_connection_manager.send_json(
            robot_id,
            {
                "type": "route_preview_request",
                "request_id": request_id,
                **command,
            },
        )
        if not sent:
            with self._lock:
                self._pending.pop(request_id, None)
            raise RoutePreviewUnavailableError("ROS Bridge is not connected")

        try:
            return await asyncio.wait_for(future, timeout=timeout_seconds)
        finally:
            with self._lock:
                self._pending.pop(request_id, None)

    def resolve(
        self,
        robot_id: str,
        result: RoutePreviewResultMessage,
    ) -> bool:
        with self._lock:
            pending = self._pending.get(result.request_id)
            if pending is None or pending.robot_id != robot_id:
                return False
            self._pending.pop(result.request_id, None)

        if not pending.future.done():
            pending.future.set_result(result)
        return True

    def fail_robot(self, robot_id: str, detail: str) -> None:
        with self._lock:
            failed = [
                (request_id, pending)
                for request_id, pending in self._pending.items()
                if pending.robot_id == robot_id
            ]
            for request_id, _ in failed:
                self._pending.pop(request_id, None)

        for _, pending in failed:
            if not pending.future.done():
                pending.future.set_exception(
                    RoutePreviewUnavailableError(detail)
                )

    def issue_validation(
        self,
        *,
        owner_id: str,
        robot_id: str,
        pickup_station_id: str,
        destination_station_id: str,
        priority: TaskPriority,
        map_revision: int,
        pickup_distance_meters: float | None = None,
        delivery_distance_meters: float | None = None,
        validity_seconds: float = PREVIEW_VALIDITY_SECONDS,
    ) -> str:
        preview_id = str(uuid4())
        now = time.monotonic()
        validation = PreviewValidation(
            owner_id=owner_id,
            robot_id=robot_id,
            pickup_station_id=pickup_station_id,
            destination_station_id=destination_station_id,
            priority=priority,
            map_revision=map_revision,
            expires_at=now + validity_seconds,
            pickup_distance_meters=pickup_distance_meters,
            delivery_distance_meters=delivery_distance_meters,
        )
        with self._lock:
            self._remove_expired_locked(now)
            self._validations[preview_id] = validation
        return preview_id

    def consume_validation(
        self,
        preview_id: str | None,
        *,
        owner_id: str,
        robot_id: str,
        pickup_station_id: str,
        destination_station_id: str,
        priority: TaskPriority,
        map_revision: int,
    ) -> PreviewValidation | None:
        if not preview_id:
            return None
        now = time.monotonic()
        with self._lock:
            self._remove_expired_locked(now)
            validation = self._validations.pop(preview_id, None)
        matches = (
            validation is not None
            and validation.owner_id == owner_id
            and validation.robot_id == robot_id
            and validation.pickup_station_id == pickup_station_id
            and validation.destination_station_id == destination_station_id
            and validation.priority == priority
            and validation.map_revision == map_revision
        )
        return validation if matches else None

    def clear(self) -> None:
        with self._lock:
            pending = list(self._pending.values())
            self._pending.clear()
            self._validations.clear()
        for item in pending:
            if not item.future.done():
                item.future.cancel()

    def _remove_expired_locked(self, now: float) -> None:
        expired = [
            preview_id
            for preview_id, validation in self._validations.items()
            if validation.expires_at <= now
        ]
        for preview_id in expired:
            self._validations.pop(preview_id, None)


def path_distance(poses: list[NavigationPathPose]) -> float:
    return sum(
        math.hypot(second.x - first.x, second.y - first.y)
        for first, second in zip(poses, poses[1:])
    )


route_preview_coordinator = RoutePreviewCoordinator()
