from __future__ import annotations

from fastapi import WebSocket


class RobotConnectionManager:
    """Keeps track of active Robot Agent WebSocket connections."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def connect(
        self,
        robot_id: str,
        websocket: WebSocket,
    ) -> None:
        await websocket.accept()

        previous_connection = self._connections.get(robot_id)

        if (
            previous_connection is not None
            and previous_connection is not websocket
        ):
            try:
                await previous_connection.close(
                    code=1012,
                    reason="Replaced by a newer Robot Agent connection",
                )
            except RuntimeError:
                pass

        self._connections[robot_id] = websocket

    def disconnect(
        self,
        robot_id: str,
        websocket: WebSocket,
    ) -> None:
        current_connection = self._connections.get(robot_id)

        if current_connection is websocket:
            self._connections.pop(robot_id, None)

    def is_connected(self, robot_id: str) -> bool:
        return robot_id in self._connections

    def connected_robot_ids(self) -> list[str]:
        return sorted(self._connections)

    async def send_json(
        self,
        robot_id: str,
        message: dict,
    ) -> bool:
        websocket = self._connections.get(robot_id)

        if websocket is None:
            return False

        await websocket.send_json(message)
        return True


robot_connection_manager = RobotConnectionManager()
