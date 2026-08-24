from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .db_models import DeliveryTaskORM, RobotORM, StationORM
from .models import (
    DashboardOverview,
    DeliveryTask,
    DeliveryTaskCreate,
    Robot,
    RobotState,
    Station,
    StationCreate,
    TaskEvent,
    TaskStatus,
    utc_now,
)
from .repository import DeliveryRepository
from .seed import reset_demo_data

ACTIVE_STATUSES = {
    TaskStatus.GOING_TO_PICKUP,
    TaskStatus.WAITING_FOR_LOADING,
    TaskStatus.DELIVERING,
    TaskStatus.WAITING_FOR_UNLOADING,
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

EVENT_TRANSITIONS = {
    (TaskStatus.GOING_TO_PICKUP, TaskEvent.ARRIVED_PICKUP): TaskStatus.WAITING_FOR_LOADING,
    (TaskStatus.WAITING_FOR_LOADING, TaskEvent.CONFIRM_LOADED): TaskStatus.DELIVERING,
    (TaskStatus.DELIVERING, TaskEvent.ARRIVED_DESTINATION): TaskStatus.WAITING_FOR_UNLOADING,
    (TaskStatus.WAITING_FOR_UNLOADING, TaskEvent.CONFIRM_RECEIVED): TaskStatus.COMPLETED,
}


class DeliveryService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = DeliveryRepository(db)

    def _robot_or_404(self, robot_id: str = "robot01") -> RobotORM:
        robot = self.repo.get_robot(robot_id)
        if not robot:
            raise HTTPException(status_code=404, detail="Robot not found")
        return robot

    def list_robots(self) -> list[RobotORM]:
        return self.repo.list_robots()

    def get_robot(self, robot_id: str) -> RobotORM:
        return self._robot_or_404(robot_id)

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

    def list_tasks(self, task_status: TaskStatus | None = None) -> list[DeliveryTaskORM]:
        return self.repo.list_tasks(task_status)

    def get_task(self, task_id: str) -> DeliveryTaskORM:
        task = self.repo.get_task(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task

    def active_task(self) -> DeliveryTaskORM | None:
        return self.repo.active_task(ACTIVE_STATUSES)

    def create_task(self, payload: DeliveryTaskCreate) -> DeliveryTaskORM:
        self.get_station(payload.pickup_station_id)
        self.get_station(payload.destination_station_id)
        robot = self._robot_or_404()

        task = DeliveryTaskORM(
            id=self.repo.next_task_id(),
            pickup_station_id=payload.pickup_station_id,
            destination_station_id=payload.destination_station_id,
            status=TaskStatus.QUEUED,
            created_at=utc_now(),
            progress=0,
        )
        self.repo.add_task(task)

        if robot.online and robot.state == RobotState.IDLE and not self.active_task():
            self._assign_task(task, robot)

        self.db.commit()
        self.db.refresh(task)
        return task

    def _assign_task(self, task: DeliveryTaskORM, robot: RobotORM | None = None) -> DeliveryTaskORM:
        robot = robot or self._robot_or_404()
        task.robot_id = robot.id
        task.status = TaskStatus.GOING_TO_PICKUP
        task.progress = PROGRESS[task.status]
        task.started_at = utc_now()

        robot.state = RobotState.GOING_TO_PICKUP
        robot.current_task_id = task.id
        robot.last_seen = "Just now"
        return task

    def dispatch_next_queued_task(self) -> DeliveryTaskORM | None:
        robot = self._robot_or_404()
        if self.active_task() or robot.state != RobotState.IDLE or not robot.online:
            return None

        queued = self.repo.queued_tasks()
        if not queued:
            return None
        return self._assign_task(queued[0], robot)

    def apply_task_event(self, task_id: str, event: TaskEvent) -> DeliveryTaskORM:
        task = self.get_task(task_id)
        robot = self._robot_or_404()
        expected = EVENT_TRANSITIONS.get((task.status, event))
        if expected is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Event {event.value} is invalid while task is {task.status.value}",
            )

        task.status = expected
        task.progress = PROGRESS[expected]
        robot.last_seen = "Just now"

        if expected == TaskStatus.WAITING_FOR_LOADING:
            pickup = self.get_station(task.pickup_station_id)
            robot.state = RobotState.WAITING_FOR_LOADING
            robot.x = pickup.x
            robot.y = pickup.y
            robot.yaw = pickup.yaw

        elif expected == TaskStatus.DELIVERING:
            robot.state = RobotState.DELIVERING

        elif expected == TaskStatus.WAITING_FOR_UNLOADING:
            destination = self.get_station(task.destination_station_id)
            robot.state = RobotState.WAITING_FOR_UNLOADING
            robot.x = destination.x
            robot.y = destination.y
            robot.yaw = destination.yaw

        elif expected == TaskStatus.COMPLETED:
            destination = self.get_station(task.destination_station_id)
            task.completed_at = utc_now()
            robot.state = RobotState.IDLE
            robot.current_task_id = None
            robot.x = destination.x
            robot.y = destination.y
            robot.yaw = destination.yaw
            self.db.flush()
            self.dispatch_next_queued_task()

        self.db.commit()
        self.db.refresh(task)
        return task

    def cancel_task(self, task_id: str) -> DeliveryTaskORM:
        task = self.get_task(task_id)
        robot = self._robot_or_404()
        if task.status not in {TaskStatus.QUEUED, TaskStatus.GOING_TO_PICKUP}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only QUEUED or GOING_TO_PICKUP tasks can be cancelled in Phase 3",
            )

        was_active = task.status == TaskStatus.GOING_TO_PICKUP
        task.status = TaskStatus.CANCELLED
        task.progress = 0

        if was_active:
            robot.state = RobotState.IDLE
            robot.current_task_id = None
            self.db.flush()
            self.dispatch_next_queued_task()

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
        )

    def reset_demo(self) -> DashboardOverview:
        reset_demo_data(self.db)
        return self.overview()
