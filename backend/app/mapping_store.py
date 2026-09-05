from __future__ import annotations

from threading import Lock
from uuid import uuid4

from .models import MappingPhase, MappingSession, RobotMappingStatusMessage, utc_now


ACTIVE_PHASES = frozenset({
    MappingPhase.STARTING,
    MappingPhase.MAPPING,
    MappingPhase.STOPPING,
    MappingPhase.REVIEW,
    MappingPhase.SAVING,
    MappingPhase.RESTORING,
})


class MappingStore:
    """Ephemeral orchestration state; ROS remains authoritative for map data."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._sessions: dict[str, MappingSession] = {}

    def get(self, robot_id: str) -> MappingSession:
        with self._lock:
            session = self._sessions.get(robot_id)
            if session is None:
                return MappingSession(
                    robot_id=robot_id,
                    phase=MappingPhase.IDLE,
                    updated_at=utc_now(),
                )
            return session.model_copy(deep=True)

    def start(self, robot_id: str) -> tuple[MappingSession, str] | None:
        with self._lock:
            current = self._sessions.get(robot_id)
            if current is not None and current.phase in ACTIVE_PHASES:
                return None
            now = utc_now()
            session_id = f"mapping:{robot_id}:{uuid4().hex}"
            command_id = f"mapping-start:{robot_id}:{uuid4().hex}"
            session = MappingSession(
                robot_id=robot_id,
                session_id=session_id,
                phase=MappingPhase.STARTING,
                detail="Preparing ROS mapping mode",
                started_at=now,
                updated_at=now,
            )
            self._sessions[robot_id] = session
            return session.model_copy(deep=True), command_id

    def request(self, robot_id: str, phase: MappingPhase) -> tuple[MappingSession, str]:
        with self._lock:
            current = self._sessions[robot_id]
            command_id = f"mapping-{phase.value.lower()}:{robot_id}:{uuid4().hex}"
            updated = current.model_copy(update={"phase": phase, "updated_at": utc_now()})
            self._sessions[robot_id] = updated
            return updated.model_copy(deep=True), command_id

    def apply(self, message: RobotMappingStatusMessage) -> MappingSession:
        with self._lock:
            current = self._sessions.get(message.robot_id)
            if (
                current is not None
                and current.phase in ACTIVE_PHASES
                and current.session_id != message.session_id
                and message.phase != MappingPhase.IDLE
            ):
                return current.model_copy(deep=True)
            session = MappingSession(
                robot_id=message.robot_id,
                session_id=message.session_id,
                phase=message.phase,
                detail=message.detail,
                started_at=message.started_at or (current.started_at if current else None),
                updated_at=utc_now(),
                saved_map_id=message.saved_map_id,
                map_revision=message.map_revision,
            )
            self._sessions[message.robot_id] = session
            return session.model_copy(deep=True)

    def fail(self, robot_id: str, detail: str) -> MappingSession:
        with self._lock:
            current = self._sessions.get(robot_id)
            session = MappingSession(
                robot_id=robot_id,
                session_id=current.session_id if current else None,
                phase=MappingPhase.FAILED,
                detail=detail,
                started_at=current.started_at if current else None,
                updated_at=utc_now(),
            )
            self._sessions[robot_id] = session
            return session.model_copy(deep=True)

    def is_active(self, robot_id: str = "robot01") -> bool:
        return self.get(robot_id).phase in ACTIVE_PHASES

    def clear(self) -> None:
        with self._lock:
            self._sessions.clear()


mapping_store = MappingStore()
