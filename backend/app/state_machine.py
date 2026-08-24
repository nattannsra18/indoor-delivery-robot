from __future__ import annotations

from dataclasses import dataclass

from .models import RobotState, TaskEvent, TaskStatus


class InvalidTransitionError(ValueError):
    pass


@dataclass(frozen=True)
class Transition:
    from_status: TaskStatus
    event: TaskEvent
    to_status: TaskStatus
    robot_state: RobotState


_TRANSITIONS = {
    (TaskStatus.GOING_TO_PICKUP, TaskEvent.ARRIVED_PICKUP): Transition(
        TaskStatus.GOING_TO_PICKUP,
        TaskEvent.ARRIVED_PICKUP,
        TaskStatus.WAITING_FOR_LOADING,
        RobotState.WAITING_FOR_LOADING,
    ),
    (TaskStatus.WAITING_FOR_LOADING, TaskEvent.CONFIRM_LOADED): Transition(
        TaskStatus.WAITING_FOR_LOADING,
        TaskEvent.CONFIRM_LOADED,
        TaskStatus.DELIVERING,
        RobotState.DELIVERING,
    ),
    (TaskStatus.DELIVERING, TaskEvent.ARRIVED_DESTINATION): Transition(
        TaskStatus.DELIVERING,
        TaskEvent.ARRIVED_DESTINATION,
        TaskStatus.WAITING_FOR_UNLOADING,
        RobotState.WAITING_FOR_UNLOADING,
    ),
    (TaskStatus.WAITING_FOR_UNLOADING, TaskEvent.CONFIRM_RECEIVED): Transition(
        TaskStatus.WAITING_FOR_UNLOADING,
        TaskEvent.CONFIRM_RECEIVED,
        TaskStatus.COMPLETED,
        RobotState.IDLE,
    ),
    (TaskStatus.GOING_TO_PICKUP, TaskEvent.NAVIGATION_FAILED): Transition(
        TaskStatus.GOING_TO_PICKUP,
        TaskEvent.NAVIGATION_FAILED,
        TaskStatus.FAILED,
        RobotState.ERROR,
    ),
    (TaskStatus.DELIVERING, TaskEvent.NAVIGATION_FAILED): Transition(
        TaskStatus.DELIVERING,
        TaskEvent.NAVIGATION_FAILED,
        TaskStatus.FAILED,
        RobotState.ERROR,
    ),
}


class DeliveryTaskStateMachine:
    @staticmethod
    def transition(current_status: TaskStatus, event: TaskEvent) -> Transition:
        transition = _TRANSITIONS.get((current_status, event))
        if transition is None:
            raise InvalidTransitionError(
                f"Event {event.value} is invalid while task is {current_status.value}"
            )
        return transition

    @staticmethod
    def allowed_events(current_status: TaskStatus) -> list[TaskEvent]:
        return [event for status, event in _TRANSITIONS if status == current_status]
