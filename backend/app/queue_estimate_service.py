from __future__ import annotations

import math

from sqlalchemy.orm import Session

from .models import TaskEstimate, TaskEstimateAvailability, TaskStatus, utc_now
from .navigation_feedback_store import (
    NavigationFeedbackStore,
    navigation_feedback_store,
)
from .repository import DeliveryRepository
from .route_preview import PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND
from .service import ACTIVE_STATUSES

PICKUP_NAVIGATION_SECONDS = 22.0
LOADING_SECONDS = 10.0
DELIVERY_SECONDS = 23.0
UNLOADING_SECONDS = 12.0
ESTIMATED_TASK_SECONDS = (
    PICKUP_NAVIGATION_SECONDS
    + LOADING_SECONDS
    + DELIVERY_SECONDS
    + UNLOADING_SECONDS
)
# Matches the dashboard's existing navigation stale cadence.  A live Nav2 ETA
# is useful only while the backend has received feedback within this window.
NAVIGATION_FEEDBACK_FRESHNESS_SECONDS = 5.0


class QueueEstimateService:
    def __init__(
        self,
        db: Session,
        *,
        feedback_store: NavigationFeedbackStore = navigation_feedback_store,
    ) -> None:
        self.repo = DeliveryRepository(db)
        self.feedback_store = feedback_store

    def list_for_owner(self, owner_id: str | None) -> list[TaskEstimate]:
        tasks = self.repo.list_tasks(owner_id=owner_id)
        global_queue = self.repo.queued_tasks()
        position_by_id = {
            task.id: index + 1 for index, task in enumerate(global_queue)
        }
        active = self.repo.active_task(ACTIVE_STATUSES)
        active_remaining = self._active_remaining(active)
        generated_at = utc_now()
        estimates = []
        for task in tasks:
            starts = None
            pickup = destination = None
            position = None
            if task.status == TaskStatus.QUEUED:
                position = position_by_id.get(task.id)
                if position is not None and active_remaining is not None:
                    tasks_ahead = global_queue[:position - 1]
                    starts = active_remaining + sum(
                        self._estimated_task_seconds(queued)
                        for queued in tasks_ahead
                    )
                    pickup_navigation = self._navigation_seconds(
                        task.pickup_distance_meters,
                        PICKUP_NAVIGATION_SECONDS,
                    )
                    delivery_navigation = self._navigation_seconds(
                        task.delivery_distance_meters,
                        DELIVERY_SECONDS,
                    )
                    pickup = starts + pickup_navigation
                    destination = pickup + LOADING_SECONDS + delivery_navigation
            elif task.status == TaskStatus.GOING_TO_PICKUP:
                pickup = self._live_eta(task.robot_id, task.id, "pickup")
                if pickup is not None:
                    destination = (
                        pickup
                        + LOADING_SECONDS
                        + self._navigation_seconds(
                            task.delivery_distance_meters,
                            DELIVERY_SECONDS,
                        )
                    )
            elif task.status == TaskStatus.DELIVERING:
                destination = self._live_eta(task.robot_id, task.id, "destination")

            values = (pickup, destination)
            available_count = sum(value is not None for value in values)
            availability = (
                TaskEstimateAvailability.AVAILABLE
                if available_count == 2
                else TaskEstimateAvailability.PARTIAL
                if available_count == 1
                else TaskEstimateAvailability.UNAVAILABLE
            )
            estimates.append(TaskEstimate(
                task_id=task.id,
                status=task.status,
                queue_position=position,
                start_eta_seconds=starts,
                pickup_eta_seconds=pickup,
                destination_eta_seconds=destination,
                generated_at=generated_at,
                availability=availability,
                completed_at=task.completed_at if task.status == TaskStatus.COMPLETED else None,
            ))
        return estimates

    def total_queued_seconds(self, tasks=None) -> float:
        queued = self.repo.queued_tasks() if tasks is None else tasks
        return sum(self._estimated_task_seconds(task) for task in queued)

    def _estimated_task_seconds(self, task) -> float:
        return (
            self._navigation_seconds(
                task.pickup_distance_meters,
                PICKUP_NAVIGATION_SECONDS,
            )
            + LOADING_SECONDS
            + self._navigation_seconds(
                task.delivery_distance_meters,
                DELIVERY_SECONDS,
            )
            + UNLOADING_SECONDS
        )

    @staticmethod
    def _navigation_seconds(distance_meters, fallback: float) -> float:
        if (
            distance_meters is None
            or not math.isfinite(distance_meters)
            or distance_meters < 0
        ):
            return fallback
        return distance_meters / PREVIEW_NOMINAL_SPEED_METERS_PER_SECOND

    def _active_remaining(self, active) -> float | None:
        if active is None:
            return 0.0
        if active.status == TaskStatus.GOING_TO_PICKUP:
            navigation = self._live_or_planned(
                active.robot_id,
                active.id,
                "pickup",
                active.pickup_distance_meters,
                PICKUP_NAVIGATION_SECONDS,
            )
            delivery = self._navigation_seconds(
                active.delivery_distance_meters,
                DELIVERY_SECONDS,
            )
            return navigation + LOADING_SECONDS + delivery + UNLOADING_SECONDS
        if active.status == TaskStatus.WAITING_FOR_LOADING:
            delivery = self._navigation_seconds(
                active.delivery_distance_meters,
                DELIVERY_SECONDS,
            )
            return LOADING_SECONDS + delivery + UNLOADING_SECONDS
        if active.status == TaskStatus.DELIVERING:
            navigation = self._live_or_planned(
                active.robot_id,
                active.id,
                "destination",
                active.delivery_distance_meters,
                DELIVERY_SECONDS,
            )
            return navigation + UNLOADING_SECONDS
        if active.status == TaskStatus.WAITING_FOR_UNLOADING:
            return UNLOADING_SECONDS
        return None

    def _live_eta(self, robot_id: str | None, task_id: str, stage: str) -> float | None:
        if robot_id is None:
            return None
        feedback = self.feedback_store.get_matching_fresh(
            robot_id,
            task_id,
            stage,
            NAVIGATION_FEEDBACK_FRESHNESS_SECONDS,
        )
        if feedback is None:
            return None
        value = feedback.estimated_time_remaining_seconds
        if value is None or not math.isfinite(value) or value < 0:
            return None
        return value

    def _live_or_planned(
        self,
        robot_id,
        task_id,
        stage,
        distance_meters,
        fallback,
    ):
        live = self._live_eta(robot_id, task_id, stage)
        return (
            self._navigation_seconds(distance_meters, fallback)
            if live is None
            else live
        )
