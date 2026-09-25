import asyncio

import pytest
from fastapi import WebSocketDisconnect

from app.routers import camera as camera_router
from app.camera_stream import (
    BROWSER_CAMERA_HEADER,
    BROWSER_CAMERA_MAGIC,
    CAMERA_PROTOCOL_VERSION,
    ROBOT_CAMERA_HEADER,
    ROBOT_CAMERA_MAGIC,
    CameraStreamBroker,
    multipart_frame,
    pack_browser_camera_frame,
)


class Socket:
    def __init__(self):
        self.closed = None

    async def close(self, code, reason):
        self.closed = (code, reason)


class BrowserSocket:
    def __init__(self):
        self.accepted = False
        self.sent: list[bytes] = []
        self.requests = iter([
            {"type": "next_frame", "after_sequence": 0},
        ])

    async def accept(self):
        self.accepted = True

    async def receive_json(self):
        try:
            return next(self.requests)
        except StopIteration as error:
            raise WebSocketDisconnect() from error

    async def send_bytes(self, data):
        self.sent.append(data)


class Database:
    def rollback(self):
        pass


def jpeg(value: bytes = b"payload") -> bytes:
    return b"\xff\xd8" + value + b"\xff\xd9"


def test_camera_broker_keeps_latest_frame_without_queueing_history():
    async def scenario():
        broker = CameraStreamBroker()
        socket = Socket()
        await broker.connect("robot01", socket)
        first = await broker.publish("robot01", socket, jpeg(b"first"))
        second = await broker.publish("robot01", socket, jpeg(b"second"))

        observed = await broker.wait_for_frame("robot01", first.sequence)
        assert observed is second
        assert b"Content-Type: image/jpeg" in multipart_frame(second)
        assert multipart_frame(second).endswith(jpeg(b"second") + b"\r\n")

    asyncio.run(scenario())


def test_camera_broker_preserves_capture_timing_for_browser_telemetry():
    async def scenario():
        broker = CameraStreamBroker()
        socket = Socket()
        await broker.connect("robot01", socket)
        source = jpeg(b"timed")
        payload = ROBOT_CAMERA_HEADER.pack(
            ROBOT_CAMERA_MAGIC,
            CAMERA_PROTOCOL_VERSION,
            42,
            1_000_000,
            2_000_000,
        ) + source

        frame = await broker.publish("robot01", socket, payload)
        browser_payload = pack_browser_camera_frame(frame)
        magic, version, sequence, source_sequence, captured, received = (
            BROWSER_CAMERA_HEADER.unpack_from(browser_payload)
        )

        assert magic == BROWSER_CAMERA_MAGIC
        assert version == CAMERA_PROTOCOL_VERSION
        assert sequence == 1
        assert source_sequence == 42
        assert captured == 1_000_000
        assert received >= 2_000_000
        assert browser_payload[BROWSER_CAMERA_HEADER.size:] == source

    asyncio.run(scenario())


def test_camera_broker_rejects_malformed_and_oversized_frames():
    async def scenario():
        broker = CameraStreamBroker()
        socket = Socket()
        await broker.connect("robot01", socket)
        with pytest.raises(ValueError, match="frame envelope"):
            await broker.publish("robot01", socket, b"not-jpeg")
        with pytest.raises(ValueError, match="size limit"):
            await broker.publish(
                "robot01",
                socket,
                b"\xff\xd8" + b"x" * 1_000_000 + b"\xff\xd9",
            )

    asyncio.run(scenario())


def test_camera_broker_replaces_and_revokes_publishers():
    async def scenario():
        broker = CameraStreamBroker()
        first = Socket()
        second = Socket()
        await broker.connect("robot01", first)
        await broker.connect("robot01", second)
        assert first.closed == (
            1012,
            "Replaced by a newer camera publisher",
        )
        with pytest.raises(RuntimeError, match="no longer active"):
            await broker.publish("robot01", first, jpeg())
        assert await broker.close("robot01") is True
        assert second.closed == (1008, "Robot camera credential revoked")
        assert broker.is_connected("robot01") is False

    asyncio.run(scenario())


def test_browser_websocket_pulls_exactly_one_latest_frame(monkeypatch):
    class Delivery:
        def __init__(self, _db):
            pass

        def get_robot(self, robot_id):
            assert robot_id == "robot01"

    async def scenario():
        camera_router.camera_stream_broker.clear()
        publisher = Socket()
        await camera_router.camera_stream_broker.connect(
            "robot01",
            publisher,
        )
        expected = jpeg(b"latest")
        await camera_router.camera_stream_broker.publish(
            "robot01",
            publisher,
            expected,
        )
        browser = BrowserSocket()

        await camera_router.browser_camera_websocket(
            browser,
            "robot01",
            Database(),
        )

        assert browser.accepted is True
        assert len(browser.sent) == 1
        assert browser.sent[0][BROWSER_CAMERA_HEADER.size:] == expected
        camera_router.camera_stream_broker.clear()

    monkeypatch.setattr(camera_router, "websocket_user", lambda *_: object())
    monkeypatch.setattr(camera_router, "DeliveryService", Delivery)
    asyncio.run(scenario())
