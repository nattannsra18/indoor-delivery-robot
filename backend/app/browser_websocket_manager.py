from __future__ import annotations

from fastapi import WebSocket

from .models import UserRole


class BrowserConnectionManager:
    """Tracks browser dashboard WebSocket connections."""

    def __init__(self) -> None:
        self._connections: dict[WebSocket, tuple[UserRole, str]] = {}

    async def connect(
        self,
        websocket: WebSocket,
        role: UserRole,
        user_id: str,
    ) -> None:
        await websocket.accept()
        self._connections[websocket] = (role, user_id)

    def disconnect(
        self,
        websocket: WebSocket,
    ) -> None:
        self._connections.pop(websocket, None)

    def connection_count(self) -> int:
        return len(self._connections)

    async def broadcast_json(
        self,
        message: dict,
        *,
        admin_only: bool = False,
        owner_id: str | None = None,
    ) -> None:
        disconnected: list[WebSocket] = []

        for websocket, identity in tuple(self._connections.items()):
            role, user_id = identity
            if admin_only and role != UserRole.ADMIN:
                continue
            if owner_id is not None and role != UserRole.ADMIN and owner_id != user_id:
                continue
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)


browser_connection_manager = BrowserConnectionManager()
