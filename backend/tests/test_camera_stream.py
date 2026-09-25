import asyncio

import pytest

from app.camera_stream import CameraStreamBroker, multipart_frame


class Socket:
    def __init__(self):
        self.closed = None

    async def close(self, code, reason):
        self.closed = (code, reason)


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


def test_camera_broker_rejects_malformed_and_oversized_frames():
    async def scenario():
        broker = CameraStreamBroker()
        socket = Socket()
        await broker.connect("robot01", socket)
        with pytest.raises(ValueError, match="complete JPEG"):
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
