"""Authenticated outbound robot camera transport and browser stream."""

from __future__ import annotations

from collections.abc import AsyncIterator

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from ..auth import require_user, websocket_user
from ..camera_stream import (
    CAMERA_BOUNDARY,
    MAX_CAMERA_FRAME_BYTES,
    camera_stream_broker,
    multipart_frame,
    pack_browser_camera_frame,
)
from ..database import get_db
from ..db_models import UserORM
from ..robot_registry import RobotRegistryService, bearer_value
from ..service import DeliveryService


router = APIRouter(tags=["camera"])


@router.websocket("/ws/robots/{robot_id}/camera")
async def robot_camera_websocket(
    websocket: WebSocket,
    robot_id: str,
    db: Session = Depends(get_db),
) -> None:
    credential_value = bearer_value(
        websocket.headers.get("authorization", "")
    )
    registry = RobotRegistryService(db)
    credential = (
        registry.authenticate(robot_id, credential_value)
        if credential_value is not None
        else None
    )
    if credential is None:
        db.rollback()
        await websocket.close(code=1008, reason="Robot authentication failed")
        return
    try:
        DeliveryService(db).get_robot(robot_id)
    except HTTPException:
        db.rollback()
        await websocket.close(code=1008, reason="Robot does not exist")
        return
    db.rollback()

    await websocket.accept()
    await camera_stream_broker.connect(robot_id, websocket)
    await websocket.send_json({
        "type": "camera_ready",
        "robot_id": robot_id,
        "transport": "latest-jpeg-ack-v1",
        "max_frame_bytes": MAX_CAMERA_FRAME_BYTES,
    })
    try:
        while True:
            message = await websocket.receive()
            if message.get("type") == "websocket.disconnect":
                break
            data = message.get("bytes")
            if data is None:
                await websocket.close(code=1003, reason="Binary JPEG frames required")
                break
            try:
                frame = await camera_stream_broker.publish(
                    robot_id,
                    websocket,
                    data,
                )
                if frame.source_sequence > 0:
                    await websocket.send_json({
                        "type": "camera_frame_ack",
                        "source_sequence": frame.source_sequence,
                    })
            except ValueError as error:
                await websocket.close(code=1009, reason=str(error))
                break
    except WebSocketDisconnect:
        pass
    finally:
        await camera_stream_broker.disconnect(robot_id, websocket)


@router.websocket("/ws/browser/robots/{robot_id}/camera")
async def browser_camera_websocket(
    websocket: WebSocket,
    robot_id: str,
    db: Session = Depends(get_db),
) -> None:
    if websocket_user(websocket, db) is None:
        db.rollback()
        await websocket.close(code=1008, reason="Authentication required")
        return
    try:
        DeliveryService(db).get_robot(robot_id)
    except HTTPException:
        db.rollback()
        await websocket.close(code=1008, reason="Robot does not exist")
        return
    db.rollback()

    await websocket.accept()
    try:
        while True:
            request = await websocket.receive_json()
            if request.get("type") != "next_frame":
                await websocket.close(
                    code=1003,
                    reason="A next_frame request is required",
                )
                return
            after_sequence = request.get("after_sequence")
            if (
                isinstance(after_sequence, bool)
                or not isinstance(after_sequence, int)
                or after_sequence < 0
            ):
                await websocket.close(
                    code=1008,
                    reason="after_sequence must be a non-negative integer",
                )
                return
            frame = await camera_stream_broker.wait_for_frame(
                robot_id,
                after_sequence,
            )
            if frame is None:
                await websocket.send_json({"type": "camera_unavailable"})
                continue
            await websocket.send_bytes(pack_browser_camera_frame(frame))
    except WebSocketDisconnect:
        pass


@router.get("/api/robots/{robot_id}/camera/stream")
async def browser_camera_stream(
    robot_id: str,
    db: Session = Depends(get_db, scope="function"),
    _: UserORM = Depends(require_user),
) -> StreamingResponse:
    DeliveryService(db).get_robot(robot_id)

    async def frames() -> AsyncIterator[bytes]:
        sequence = 0
        while True:
            frame = await camera_stream_broker.wait_for_frame(
                robot_id,
                sequence,
            )
            if frame is None:
                if not camera_stream_broker.is_connected(robot_id):
                    return
                continue
            sequence = frame.sequence
            yield multipart_frame(frame)

    return StreamingResponse(
        frames(),
        media_type=(
            "multipart/x-mixed-replace; "
            f"boundary={CAMERA_BOUNDARY.decode('ascii')}"
        ),
        headers={
            "Cache-Control": "private, no-store, no-cache, must-revalidate",
            "Pragma": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/robots/{robot_id}/camera/status")
def camera_status(
    robot_id: str,
    db: Session = Depends(get_db, scope="function"),
    _: UserORM = Depends(require_user),
) -> dict[str, object]:
    DeliveryService(db).get_robot(robot_id)
    return {
        "robot_id": robot_id,
        "connected": camera_stream_broker.is_connected(robot_id),
        "transport": "latest-jpeg-pull-over-wss",
    }
