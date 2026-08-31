from __future__ import annotations

from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .db_models import (
    DeliveryTaskORM,
    RobotORM,
    StationORM,
    TaskEventORM,
)
from .models import (
    DashboardOverview,
    DeliveryTask,
    DeliveryTaskCreate,
    EventSource,
    Robot,
    RobotState,
    RobotTelemetry,
    StationCreate,
    TaskEvent,
    TaskStatus,
    utc_now,
)
from .repository import DeliveryRepository
from .seed import reset_demo_data
from .state_machine import (
    DeliveryTaskStateMachine,
    InvalidTransitionError,
)

ACTIVE_STATUSES = {
    TaskStatus.GOING_TO_PICKUP,
    TaskStatus.WAITING_FOR_LOADING,
    TaskStatus.DELIVERING,
    TaskStatus.WAITING_FOR_UNLOADING,
}

TERMINAL_STATUSES = {
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.CANCELLED,
}

PROGRESS = {
    TaskStatus.QUEUED: 0,
    TaskStatus.GOING_TO_PICKUP: 20,
    TaskStatus.WAITING_FOR_LOADING: 35,
    TaskStatus.DELIVERING: 70,
    TaskStatus.WAITING_FOR_UNLOADING: 90,
    TaskStatus.COMPLETED: 100,
    TaskStatus.FAILED: 0,
    TaskStatus.CANCELLED: 0,
}


class DeliveryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DeliveryRepository(db)

    def _robot_or_404(self, robot_id: str = "robot01", *, lock: bool = False) -> RobotORM:
        robot = self.repo.get_robot_for_update(robot_id) if lock else self.repo.get_robot(robot_id)
        if not robot:
            raise HTTPException(status_code=404, detail="Robot not found")
        return robot

    def _task_or_404(self, task_id: str, *, lock: bool = False) -> DeliveryTaskORM:
        task = self.repo.get_task_for_update(task_id) if lock else self.repo.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task

    def _log_event(
        self,
        task: DeliveryTaskORM,
        event_type: str,
        from_status: TaskStatus | None,
        to_status: TaskStatus,
        source: str,
        detail: str | None = None,
    ) -> None:
        self.repo.add_task_event(
            TaskEventORM(
                task_id=task.id,
                event_type=event_type,
                from_status=from_status,
                to_status=to_status,
                source=source,
                detail=detail,
                created_at=utc_now(),
            )
        )

    # Robots
    def list_robots(self) -> list[RobotORM]:
        return self.repo.list_robots()

    def get_robot(self, robot_id: str) -> RobotORM:
        return self._robot_or_404(robot_id)

    def update_robot_telemetry(
        self,
        robot_id: str,
        telemetry: RobotTelemetry,
    ) -> RobotORM:
        robot = self._robot_or_404(
            robot_id,
            lock=True,
        )

        robot.x = telemetry.x
        robot.y = telemetry.y
        robot.yaw = telemetry.yaw
        robot.battery = telemetry.battery
        robot.last_seen = "Just now"

        self.db.commit()
        self.db.refresh(robot)

        return robot

    def set_robot_offline(self, robot_id: str) -> RobotORM:
        robot = self._robot_or_404(robot_id, lock=True)
        if not robot.online and robot.state == RobotState.OFFLINE:
            return robot
        active = self.repo.active_task_for_robot(robot.id, ACTIVE_STATUSES)

        if active:
            old_status = active.status
            active.status = TaskStatus.FAILED
            active.progress = PROGRESS[TaskStatus.FAILED]
            self._log_event(
                active,
                "ROBOT_OFFLINE",
                old_status,
                TaskStatus.FAILED,
                EventSource.SYSTEM.value,
                "Robot was marked offline while this task was active.",
            )

        robot.online = False
        robot.state = RobotState.OFFLINE
        robot.current_task_id = None
        robot.last_seen = "Offline"
        self.db.commit()
        self.db.refresh(robot)
        return robot

    def set_robot_online(self, robot_id: str) -> RobotORM:
        robot = self._robot_or_404(robot_id, lock=True)
        if robot.online and robot.state != RobotState.OFFLINE:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Robot is already online in state {robot.state.value}",
            )
        robot.online = True
        robot.state = RobotState.IDLE
        robot.current_task_id = None
        robot.last_seen = "Just now"
        self.db.flush()
        self.dispatch_next_queued_task(robot=robot)
        self.db.commit()
        self.db.refresh(robot)
        return robot

    def recover_robot(self, robot_id: str) -> RobotORM:
        robot = self._robot_or_404(robot_id, lock=True)
        if not robot.online:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Offline robot must be brought online before recovery",
            )
        if robot.state != RobotState.ERROR:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Robot recovery is only valid from ERROR, current state is {robot.state.value}",
            )

        robot.state = RobotState.IDLE
        robot.current_task_id = None
        robot.last_seen = "Just now"
        self.db.flush()
        self.dispatch_next_queued_task(robot=robot)
        self.db.commit()
        self.db.refresh(robot)
        return robot

    # Stations
    def list_stations(self) -> list[StationORM]:
        return self.repo.list_stations()

    def get_station(self, station_id: str) -> StationORM:
        station = self.repo.get_station(station_id)
        if not station:
            raise HTTPException(status_code=404, detail="Station not found")
        return station

    def add_station(self, payload: StationCreate) -> StationORM:
        station = StationORM(id=self.repo.next_station_id(), **payload.model_dump())
        self.repo.add_station(station)
        self.db.commit()
        self.db.refresh(station)
        return station

    def delete_station(self, station_id: str) -> None:
        station = self.get_station(station_id)
        if self.repo.station_is_referenced(station.id):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Station is referenced by a delivery task",
            )
        self.repo.delete_station(station)
        self.db.commit()

    # Tasks
    def list_tasks(self, task_status: TaskStatus | None = None) -> list[DeliveryTaskORM]:
        return self.repo.list_tasks(task_status)

    def get_task(self, task_id: str) -> DeliveryTaskORM:
        return self._task_or_404(task_id)

    def get_task_history(self, task_id: str) -> list[TaskEventORM]:
        self.get_task(task_id)
        return self.repo.list_task_events(task_id)

    def active_task(self) -> DeliveryTaskORM | None:
        return self.repo.active_task(ACTIVE_STATUSES)

    def build_navigation_command(
        self,
        task: DeliveryTaskORM,
    ) -> dict | None:
        if task.robot_id is None:
            return None

        if task.status == TaskStatus.GOING_TO_PICKUP:
            stage = "pickup"
            station = self.get_station(
                task.pickup_station_id
            )

        elif task.status == TaskStatus.DELIVERING:
            stage = "destination"
            station = self.get_station(
                task.destination_station_id
            )

        else:
            return None

        return {
            "type": "command",
            "command_id": (
                f"{task.id}:{stage}:{uuid4().hex}"
            ),
            "command": "navigate_to_pose",
            "robot_id": task.robot_id,
            "task_id": task.id,
            "stage": stage,
            "target": {
                "station_id": station.id,
                "frame_id": "map",
                "x": station.x,
                "y": station.y,
                "yaw": station.yaw,
            },
        }

    def create_task(self, payload: DeliveryTaskCreate) -> DeliveryTaskORM:
        self.get_station(payload.pickup_station_id)
        self.get_station(payload.destination_station_id)
        robot = self._robot_or_404(lock=True)

        task = DeliveryTaskORM(
            id=self.repo.next_task_id(),
            pickup_station_id=payload.pickup_station_id,
            destination_station_id=payload.destination_station_id,
            status=TaskStatus.QUEUED,
            created_at=utc_now(),
            progress=0,
        )
        self.repo.add_task(task)
        self._log_event(
            task,
            "TASK_CREATED",
            None,
            TaskStatus.QUEUED,
            EventSource.SYSTEM.value,
        )

        if self._robot_available(robot):
            self._assign_task(task, robot)

        self.db.commit()
        self.db.refresh(task)
        return task

    def _robot_available(self, robot: RobotORM) -> bool:
        return (
            robot.online
            and robot.state == RobotState.IDLE
            and robot.current_task_id is None
            and self.repo.active_task_for_robot(robot.id, ACTIVE_STATUSES) is None
        )

    def _assign_task(self, task: DeliveryTaskORM, robot: RobotORM) -> DeliveryTaskORM:
        if task.status != TaskStatus.QUEUED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Only QUEUED tasks can be assigned, task is {task.status.value}",
            )
        if not self._robot_available(robot):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Robot is not available for task assignment",
            )

        old_status = task.status
        task.robot_id = robot.id
        task.status = TaskStatus.GOING_TO_PICKUP
        task.progress = PROGRESS[task.status]
        task.started_at = utc_now()
        task.completed_at = None

        robot.state = RobotState.GOING_TO_PICKUP
        robot.current_task_id = task.id
        robot.last_seen = "Just now"

        self._log_event(
            task,
            "TASK_ASSIGNED",
            old_status,
            TaskStatus.GOING_TO_PICKUP,
            EventSource.SYSTEM.value,
            f"Assigned to {robot.id}",
        )
        return task

    def dispatch_next_queued_task(self, robot: RobotORM | None = None) -> DeliveryTaskORM | None:
        robot = robot or self._robot_or_404(lock=True)
        if not self._robot_available(robot):
            return None

        queued = self.repo.next_queued_task_for_update()
        if not queued:
            return None
        return self._assign_task(queued, robot)

    def apply_task_event(
        self,
        task_id: str,
        event: TaskEvent,
        source: EventSource = EventSource.WEB_SIMULATOR,
        detail: str | None = None,
    ) -> DeliveryTaskORM:
        task = self._task_or_404(task_id, lock=True)
        robot = self._robot_or_404(task.robot_id or "robot01", lock=True)

        if task.status not in ACTIVE_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Task {task.id} is not active; current status is {task.status.value}",
            )
        if task.robot_id != robot.id or robot.current_task_id != task.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Task is not the robot's current assigned task",
            )
        if not robot.online:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Robot is offline",
            )

        try:
            transition = DeliveryTaskStateMachine.transition(task.status, event)
        except InvalidTransitionError as exc:
            allowed = DeliveryTaskStateMachine.allowed_events(task.status)
            allowed_text = ", ".join(item.value for item in allowed) or "none"
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{exc}. Allowed events: {allowed_text}",
            ) from exc

        old_status = task.status
        task.status = transition.to_status
        task.progress = PROGRESS[transition.to_status]
        robot.state = transition.robot_state
        robot.last_seen = "Just now"

        if transition.to_status == TaskStatus.WAITING_FOR_LOADING:
            pickup = self.get_station(task.pickup_station_id)
            robot.x = pickup.x
            robot.y = pickup.y
            robot.yaw = pickup.yaw

        elif transition.to_status == TaskStatus.WAITING_FOR_UNLOADING:
            destination = self.get_station(task.destination_station_id)
            robot.x = destination.x
            robot.y = destination.y
            robot.yaw = destination.yaw

        elif transition.to_status == TaskStatus.COMPLETED:
            destination = self.get_station(task.destination_station_id)
            task.completed_at = utc_now()
            robot.current_task_id = None
            robot.x = destination.x
            robot.y = destination.y
            robot.yaw = destination.yaw

        elif transition.to_status == TaskStatus.FAILED:
            robot.current_task_id = task.id

        self._log_event(
            task,
            event.value,
            old_status,
            transition.to_status,
            source.value,
            detail,
        )

        if transition.to_status == TaskStatus.COMPLETED:
            self.db.flush()
            self.dispatch_next_queued_task(robot=robot)

        self.db.commit()
        self.db.refresh(task)
        return task

    def cancel_task(self, task_id: str) -> DeliveryTaskORM:
        task = self._task_or_404(task_id, lock=True)
        if task.status in TERMINAL_STATUSES:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Cannot cancel task in terminal state {task.status.value}",
            )

        robot = self._robot_or_404(task.robot_id or "robot01", lock=True)
        old_status = task.status
        task.status = TaskStatus.CANCELLED
        task.progress = 0
        task.completed_at = utc_now()

        self._log_event(
            task,
            "TASK_CANCELLED",
            old_status,
            TaskStatus.CANCELLED,
            EventSource.WEB_SIMULATOR.value,
        )

        if task.robot_id == robot.id and robot.current_task_id == task.id:
            robot.state = RobotState.IDLE if robot.online else RobotState.OFFLINE
            robot.current_task_id = None
            robot.last_seen = "Just now" if robot.online else robot.last_seen
            self.db.flush()
            if robot.online:
                self.dispatch_next_queued_task(robot=robot)

        self.db.commit()
        self.db.refresh(task)
        return task

    def retry_task(self, task_id: str) -> DeliveryTaskORM:
        task = self._task_or_404(task_id, lock=True)
        if task.status != TaskStatus.FAILED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only FAILED tasks can be retried",
            )

        robot = self._robot_or_404(task.robot_id or "robot01", lock=True)
        old_status = task.status
        task.status = TaskStatus.QUEUED
        task.progress = 0
        task.robot_id = None
        task.started_at = None
        task.completed_at = None

        self._log_event(
            task,
            "TASK_RETRIED",
            old_status,
            TaskStatus.QUEUED,
            EventSource.WEB_SIMULATOR.value,
        )

        if robot.current_task_id == task.id or robot.state == RobotState.ERROR:
            if robot.online:
                robot.state = RobotState.IDLE
                robot.current_task_id = None
                robot.last_seen = "Just now"
            else:
                robot.current_task_id = None

        self.db.flush()
        if robot.online and robot.state == RobotState.IDLE:
            self.dispatch_next_queued_task(robot=robot)

        self.db.commit()
        self.db.refresh(task)
        return task

    def overview(self) -> DashboardOverview:
        robot = self._robot_or_404()
        active = self.active_task()
        return DashboardOverview(
            robot=Robot.model_validate(robot),
            active_task=DeliveryTask.model_validate(active) if active else None,
            queued_count=self.repo.count_tasks(TaskStatus.QUEUED),
            completed_count=self.repo.count_tasks(TaskStatus.COMPLETED),
            failed_count=self.repo.count_tasks(TaskStatus.FAILED),
        )

    def reset_demo(self) -> DashboardOverview:
        reset_demo_data(self.db)
        return self.overview()
