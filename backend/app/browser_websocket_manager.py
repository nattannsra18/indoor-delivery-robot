from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass

from fastapi import WebSocket

from .models import UserRole

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class DashboardConnection:
    """Server-derived identity bound to one accepted dashboard socket."""

    role: UserRole
    user_id: str
    session_id: str | None


class BrowserConnectionManager:
    """Tracks browser dashboard WebSocket connections."""

    def __init__(self) -> None:
        self._connections: dict[WebSocket, DashboardConnection] = {}
        self._notification_tasks: set[asyncio.Task] = set()

    async def connect(
        self,
        websocket: WebSocket,
        role: UserRole,
        user_id: str,
        session_id: str | None = None,
    ) -> None:
        await websocket.accept()
        self._connections[websocket] = DashboardConnection(
            role=role,
            user_id=user_id,
            session_id=session_id,
        )

    def disconnect(
        self,
        websocket: WebSocket,
    ) -> None:
        self._connections.pop(websocket, None)

    def connection_count(self) -> int:
        return len(self._connections)

    def disconnect_session(self, session_id: str | None) -> None:
        """Immediately remove a revoked session from future private delivery.

        The WebSocket handler notices the revoked cookie on its next client
        message and closes the transport.  Removing it here is synchronous so
        logout never depends on an event loop and cannot leak a live event.
        """
        if session_id is None:
            return
        for websocket, identity in tuple(self._connections.items()):
            if identity.session_id == session_id:
                self.disconnect(websocket)

    def clear(self) -> None:
        """Test/lifecycle cleanup without reaching into connection internals."""
        self._connections.clear()
        for task in tuple(self._notification_tasks):
            task.cancel()
        self._notification_tasks.clear()

    async def drain_scheduled_notifications(self) -> None:
        """Wait for already-owned best-effort sends (primarily test cleanup)."""
        tasks = tuple(self._notification_tasks)
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)

    async def broadcast_json(
        self,
        message: dict,
        *,
        admin_only: bool = False,
        owner_id: str | None = None,
    ) -> None:
        disconnected: list[WebSocket] = []

        for websocket, identity in tuple(self._connections.items()):
            role, user_id = identity.role, identity.user_id
            if admin_only and role != UserRole.ADMIN:
                continue
            if owner_id is not None and role != UserRole.ADMIN and owner_id != user_id:
                continue
            try:
                await asyncio.wait_for(websocket.send_json(message), timeout=1)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)

    async def publish_notification(self, message: dict, recipient_id: str) -> None:
        """Post-commit private delivery using only authenticated registry data."""
        disconnected: list[WebSocket] = []
        for websocket, identity in tuple(self._connections.items()):
            if identity.user_id != recipient_id:
                continue
            try:
                await asyncio.wait_for(websocket.send_json(message), timeout=1)
            except Exception:
                logger.warning(
                    "dashboard notification delivery failed; disconnecting socket"
                )
                disconnected.append(websocket)
        for websocket in disconnected:
            self.disconnect(websocket)

    def schedule_notification(self, message: dict, recipient_id: str) -> None:
        """Keep post-commit sends owned and bounded without delaying HTTP work."""
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning(
                "dashboard notification delivery skipped because no event loop is running"
            )
            return
        task = loop.create_task(self.publish_notification(message, recipient_id))
        self._notification_tasks.add(task)
        task.add_done_callback(self._notification_tasks.discard)


browser_connection_manager = BrowserConnectionManager()
