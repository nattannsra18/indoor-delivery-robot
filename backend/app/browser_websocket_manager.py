from __future__ import annotations

from fastapi import WebSocket


class BrowserConnectionManager:
    """Tracks browser dashboard WebSocket connections."""

    def __init__(self) -> None:
        self._connections: set[WebSocket] = set()

    async def connect(
        self,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()
        self._connections.add(websocket)

    def disconnect(
        self,
        websocket: WebSocket,
    ) -> None:
        self._connections.discard(websocket)

    def connection_count(self) -> int:
        return len(self._connections)

    async def broadcast_json(
        self,
        message: dict,
    ) -> None:
        disconnected: list[WebSocket] = []

        for websocket in tuple(self._connections):
            try:
                await websocket.send_json(message)
            except Exception:
                disconnected.append(websocket)

        for websocket in disconnected:
            self.disconnect(websocket)


browser_connection_manager = BrowserConnectionManager()