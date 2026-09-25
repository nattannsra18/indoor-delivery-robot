"""Low-latency, latest-frame camera fan-out for connected robots."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
import struct
import time

from fastapi import WebSocket
from anyio import ClosedResourceError


MAX_CAMERA_FRAME_BYTES = 1_000_000
CAMERA_BOUNDARY = b"frame"
ROBOT_CAMERA_MAGIC = b"IDRC"
BROWSER_CAMERA_MAGIC = b"IDRB"
CAMERA_PROTOCOL_VERSION = 1
ROBOT_CAMERA_HEADER = struct.Struct("!4sBQQQ")
BROWSER_CAMERA_HEADER = struct.Struct("!4sBQQQQ")


@dataclass
class CameraFrame:
    data: bytes
    sequence: int
    received_at: float
    source_sequence: int
    captured_at_ns: int
    sent_at_ns: int
    received_at_ns: int


def unpack_robot_camera_frame(payload: bytes) -> tuple[bytes, int, int, int]:
    """Return JPEG and source timing, accepting legacy raw-JPEG agents."""

    if payload.startswith(b"\xff\xd8"):
        return payload, 0, 0, 0
    if len(payload) < ROBOT_CAMERA_HEADER.size + 4:
        raise ValueError("Camera frame envelope is incomplete")
    magic, version, sequence, captured_at_ns, sent_at_ns = (
        ROBOT_CAMERA_HEADER.unpack_from(payload)
    )
    if magic != ROBOT_CAMERA_MAGIC or version != CAMERA_PROTOCOL_VERSION:
        raise ValueError("Camera frame envelope is unsupported")
    return (
        payload[ROBOT_CAMERA_HEADER.size:],
        sequence,
        captured_at_ns,
        sent_at_ns,
    )


def pack_browser_camera_frame(frame: CameraFrame) -> bytes:
    """Encode one latest frame and timing for the browser pull channel."""

    return BROWSER_CAMERA_HEADER.pack(
        BROWSER_CAMERA_MAGIC,
        CAMERA_PROTOCOL_VERSION,
        frame.sequence,
        frame.source_sequence,
        frame.captured_at_ns,
        frame.received_at_ns,
    ) + frame.data


@dataclass
class _CameraState:
    condition: asyncio.Condition = field(default_factory=asyncio.Condition)
    frame: CameraFrame | None = None
    publisher: WebSocket | None = None
    sequence: int = 0


class CameraStreamBroker:
    """Keeps one JPEG per robot and drops superseded frames.

    This deliberately avoids an unbounded video queue: a slow browser receives
    the newest frame instead of accumulating latency.  A shared broker such as
    Redis is only needed if the backend is scaled beyond one process.
    """

    def __init__(self) -> None:
        self._states: dict[str, _CameraState] = {}

    def _state(self, robot_id: str) -> _CameraState:
        return self._states.setdefault(robot_id, _CameraState())

    async def connect(self, robot_id: str, websocket: WebSocket) -> None:
        state = self._state(robot_id)
        previous = state.publisher
        if previous is not None and previous is not websocket:
            try:
                await previous.close(
                    code=1012,
                    reason="Replaced by a newer camera publisher",
                )
            except (RuntimeError, ClosedResourceError):
                pass
        state.frame = None
        state.publisher = websocket

    async def disconnect(self, robot_id: str, websocket: WebSocket) -> None:
        state = self._state(robot_id)
        if state.publisher is websocket:
            state.publisher = None
            async with state.condition:
                state.condition.notify_all()

    async def publish(
        self,
        robot_id: str,
        websocket: WebSocket,
        data: bytes,
    ) -> CameraFrame:
        data, source_sequence, captured_at_ns, sent_at_ns = (
            unpack_robot_camera_frame(data)
        )
        if len(data) > MAX_CAMERA_FRAME_BYTES:
            raise ValueError("Camera frame exceeds the size limit")
        if not data.startswith(b"\xff\xd8") or not data.endswith(b"\xff\xd9"):
            raise ValueError("Camera frame must be a complete JPEG image")

        state = self._state(robot_id)
        if state.publisher is not websocket:
            raise RuntimeError("Camera publisher is no longer active")
        state.sequence += 1
        state.frame = CameraFrame(
            data=data,
            sequence=state.sequence,
            received_at=time.monotonic(),
            source_sequence=source_sequence,
            captured_at_ns=captured_at_ns,
            sent_at_ns=sent_at_ns,
            received_at_ns=time.time_ns(),
        )
        async with state.condition:
            state.condition.notify_all()
        return state.frame

    async def wait_for_frame(
        self,
        robot_id: str,
        after_sequence: int,
        *,
        timeout: float = 15.0,
    ) -> CameraFrame | None:
        state = self._state(robot_id)

        async def wait() -> CameraFrame | None:
            async with state.condition:
                await state.condition.wait_for(
                    lambda: (
                        state.publisher is None
                        or (
                            state.frame is not None
                            and state.frame.sequence > after_sequence
                        )
                    )
                )
                if state.publisher is None:
                    return None
                assert state.frame is not None
                return state.frame

        if state.frame is not None and state.frame.sequence > after_sequence:
            return state.frame
        try:
            return await asyncio.wait_for(wait(), timeout=timeout)
        except asyncio.TimeoutError:
            return None

    def is_connected(self, robot_id: str) -> bool:
        return self._state(robot_id).publisher is not None

    async def close(
        self,
        robot_id: str,
        *,
        code: int = 1008,
        reason: str = "Robot camera credential revoked",
    ) -> bool:
        state = self._state(robot_id)
        publisher = state.publisher
        state.publisher = None
        if publisher is None:
            return False
        try:
            await publisher.close(code=code, reason=reason)
        except (RuntimeError, ClosedResourceError):
            pass
        async with state.condition:
            state.condition.notify_all()
        return True

    def clear(self) -> None:
        self._states.clear()


camera_stream_broker = CameraStreamBroker()


def multipart_frame(frame: CameraFrame) -> bytes:
    return (
        b"--" + CAMERA_BOUNDARY + b"\r\n"
        b"Content-Type: image/jpeg\r\n"
        b"Content-Length: " + str(len(frame.data)).encode("ascii") + b"\r\n"
        b"X-Sequence: " + str(frame.sequence).encode("ascii") + b"\r\n\r\n"
        + frame.data
        + b"\r\n"
    )
