from __future__ import annotations

from datetime import timedelta
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .alert_service import AlertService
from .db_models import EmergencyStopORM, RobotORM, TaskEventORM
from .models import AlertSeverity, EmergencyStop, EmergencyStopState, EventSource, RobotState, TaskStatus, utc_now
from .navigation_path_store import navigation_path_store
from .navigation_feedback_store import navigation_feedback_store
from .repository import DeliveryRepository
from .service import ACTIVE_STATUSES, PROGRESS
from .config import security_settings


class EmergencyStopService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DeliveryRepository(db)

    def _load_state(
        self,
        robot_id: str,
        *,
        for_update: bool = False,
    ) -> EmergencyStopORM | None:
        statement = (
            select(EmergencyStopORM)
            .where(EmergencyStopORM.robot_id == robot_id)
            .execution_options(populate_existing=True)
        )
        if for_update:
            statement = statement.with_for_update()
        return self.db.scalar(statement)

    def get(
        self,
        robot_id: str,
        *,
        create: bool = True,
        for_update: bool = False,
    ) -> EmergencyStopORM:
        if self.repo.get_robot(robot_id) is None:
            raise HTTPException(status_code=404, detail="Robot not found")
        state = self._load_state(robot_id, for_update=for_update)
        if state is None and create:
            state = EmergencyStopORM(robot_id=robot_id, state=EmergencyStopState.NORMAL, latched=False)
            self.db.add(state)
            self.db.commit()
            self.db.refresh(state)
        assert state is not None
        self._expire_pending(state)
        return state

    def list_states(self) -> list[EmergencyStop]:
        for robot in self.repo.list_robots():
            self.get(robot.id)
        return [EmergencyStop.model_validate(item) for item in self.db.scalars(select(EmergencyStopORM)).all()]

    def is_latched(self, robot_id: str) -> bool:
        state = self._load_state(robot_id)
        return bool(state is not None and state.latched)

    def activate(self, robot_id: str) -> tuple[EmergencyStopORM, dict, bool]:
        state = self.get(robot_id)
        if state.latched:
            return state, self.command(state, "emergency_stop"), False
        now = utc_now()
        state.latched = True
        state.state = EmergencyStopState.STOP_REQUESTED
        state.pending_command_id = f"estop:{robot_id}:{uuid4().hex}"
        state.command_deadline = now + timedelta(seconds=security_settings().emergency_command_timeout_seconds)
        state.failure_detail = None
        state.activated_at = now
        state.updated_at = now
        robot = self.repo.get_robot_for_update(robot_id)
        assert robot is not None
        active = self.repo.active_task_for_robot(robot_id, ACTIVE_STATUSES)
        if active is not None:
            previous = active.status
            active.status = TaskStatus.FAILED
            active.progress = PROGRESS[TaskStatus.FAILED]
            active.completed_at = now
            self.repo.add_task_event(
                TaskEventORM(
                    task_id=active.id, event_type="EMERGENCY_STOP", from_status=previous,
                    to_status=TaskStatus.FAILED, source=EventSource.SYSTEM.value,
                    detail="Emergency stop activated", created_at=now,
                )
            )
        robot.current_task_id = None
        robot.state = RobotState.ERROR if robot.online else RobotState.OFFLINE
        navigation_path_store.clear(robot_id)
        navigation_feedback_store.clear_robot(robot_id)
        self.db.commit()
        self.db.refresh(state)
        AlertService(self.db).upsert(
            f"emergency-stop:{robot_id}", AlertSeverity.CRITICAL,
            "Emergency stop activated", "Software Emergency Stop is latched; motion is inhibited.",
            "EMERGENCY_STOP", robot_id,
        )
        return state, self.command(state, "emergency_stop"), True

    def request_reset(self, robot_id: str) -> tuple[EmergencyStopORM, dict]:
        state = self.get(robot_id)
        if not state.latched:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Emergency Stop is not latched")
        if state.state != EmergencyStopState.RESET_REQUESTED:
            state.state = EmergencyStopState.RESET_REQUESTED
            state.pending_command_id = f"estop-reset:{robot_id}:{uuid4().hex}"
            state.command_deadline = utc_now() + timedelta(seconds=security_settings().emergency_command_timeout_seconds)
            state.failure_detail = None
            state.updated_at = utc_now()
            self.db.commit()
            self.db.refresh(state)
        return state, self.command(state, "emergency_stop_reset")

    @staticmethod
    def command(state: EmergencyStopORM, command: str) -> dict:
        return {
            "type": "emergency_command", "command": command,
            "command_id": state.pending_command_id, "robot_id": state.robot_id,
        }

    def acknowledge(self, robot_id: str, command_id: str, command: str, accepted: bool, detail: str | None) -> tuple[EmergencyStopORM, bool]:
        state = self.get(robot_id, for_update=True)
        if state.pending_command_id != command_id:
            return state, False
        expected = "emergency_stop" if state.state in {EmergencyStopState.STOP_REQUESTED, EmergencyStopState.FAILED} and state.latched else "emergency_stop_reset"
        if command != expected:
            return state, False
        state.command_deadline = None
        state.pending_command_id = None
        state.updated_at = utc_now()
        if not accepted:
            state.state = EmergencyStopState.FAILED
            state.failure_detail = detail or "Robot rejected Emergency Stop command"
            self._failure_alert(state, state.failure_detail)
        elif command == "emergency_stop":
            state.state = EmergencyStopState.STOPPED
            state.failure_detail = None
        else:
            state.state = EmergencyStopState.NORMAL
            state.latched = False
            state.failure_detail = None
            state.activated_at = None
            AlertService(self.db).resolve_key(f"emergency-stop:{robot_id}")
        self.db.commit()
        self.db.refresh(state)
        return state, True

    def mark_delivery_failed(self, robot_id: str, command_id: str, detail: str) -> EmergencyStopORM:
        state = self.get(robot_id)
        if state.pending_command_id == command_id:
            state.state = EmergencyStopState.FAILED
            state.failure_detail = detail
            state.command_deadline = None
            state.updated_at = utc_now()
            self.db.commit()
            self._failure_alert(state, detail)
        return state

    def reconnect_command(self, robot_id: str) -> dict | None:
        state = self._load_state(robot_id)
        if state is None or not state.latched:
            return None
        if state.state == EmergencyStopState.RESET_REQUESTED:
            return self.command(state, "emergency_stop_reset")
        if not state.pending_command_id:
            state.pending_command_id = f"estop:{robot_id}:{uuid4().hex}"
            state.state = EmergencyStopState.STOP_REQUESTED
            state.command_deadline = utc_now() + timedelta(seconds=security_settings().emergency_command_timeout_seconds)
            self.db.commit()
        return self.command(state, "emergency_stop")

    def _expire_pending(self, state: EmergencyStopORM) -> None:
        if state.command_deadline is None or state.state not in {EmergencyStopState.STOP_REQUESTED, EmergencyStopState.RESET_REQUESTED}:
            return
        deadline = state.command_deadline
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=utc_now().tzinfo)
        if deadline <= utc_now():
            state.state = EmergencyStopState.FAILED
            state.failure_detail = "Emergency Stop command acknowledgement timed out"
            state.command_deadline = None
            self.db.commit()
            self._failure_alert(state, state.failure_detail)

    def _failure_alert(self, state: EmergencyStopORM, detail: str) -> None:
        AlertService(self.db).upsert(
            f"emergency-command-failure:{state.robot_id}", AlertSeverity.CRITICAL,
            "Emergency Stop command failed", detail, "EMERGENCY_STOP", state.robot_id,
        )
