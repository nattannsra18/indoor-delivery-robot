from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    WebSocket,
    WebSocketDisconnect,
)

from ..browser_websocket_manager import (
    browser_connection_manager,
)

router = APIRouter(tags=["dashboard-websocket"])


def current_utc_time() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.get("/api/dashboard-connections")
def list_dashboard_connections() -> dict[str, Any]:
    return {
        "count": (
            browser_connection_manager.connection_count()
        ),
    }


@router.websocket("/ws/dashboard")
async def dashboard_websocket(
    websocket: WebSocket,
) -> None:
    await browser_connection_manager.connect(websocket)

    await websocket.send_json(
        {
            "type": "dashboard_connection_ack",
            "connected": True,
            "server_time": current_utc_time(),
        }
    )

    try:
        while True:
            message = await websocket.receive_json()

            if (
                isinstance(message, dict)
                and message.get("type") == "ping"
            ):
                await websocket.send_json(
                    {
                        "type": "pong",
                        "server_time": current_utc_time(),
                    }
                )
            else:
                await websocket.send_json(
                    {
                        "type": "error",
                        "code": "UNSUPPORTED_MESSAGE",
                        "detail": (
                            "The dashboard WebSocket "
                            "currently supports only ping"
                        ),
                        "server_time": current_utc_time(),
                    }
                )

    except WebSocketDisconnect:
        browser_connection_manager.disconnect(websocket)

    except Exception:
        browser_connection_manager.disconnect(websocket)

        try:
            await websocket.close(code=1011)
        except RuntimeError:
            pass

        raise