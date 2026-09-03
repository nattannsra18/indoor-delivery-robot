from __future__ import annotations

from dataclasses import dataclass, replace
from threading import Lock
from time import monotonic
from typing import Callable


@dataclass(frozen=True)
class LatestNavigationEstimate:
    task_id: str
    stage: str
    distance_remaining: float
    estimated_time_remaining_seconds: float | None
    received_monotonic: float | None = None


class NavigationFeedbackStore:
    def __init__(
        self,
        monotonic_clock: Callable[[], float] = monotonic,
    ) -> None:
        self._lock = Lock()
        self._by_robot: dict[str, LatestNavigationEstimate] = {}
        self._monotonic_clock = monotonic_clock

    def set(self, robot_id: str, estimate: LatestNavigationEstimate) -> None:
        with self._lock:
            self._by_robot[robot_id] = replace(
                estimate,
                # This is deliberately a server-side monotonic timestamp.
                # Robot-provided wall-clock timestamps cannot establish freshness.
                received_monotonic=self._monotonic_clock(),
            )

    def get(self, robot_id: str) -> LatestNavigationEstimate | None:
        with self._lock:
            return self._by_robot.get(robot_id)

    def get_matching_fresh(
        self,
        robot_id: str,
        task_id: str,
        stage: str,
        max_age_seconds: float,
    ) -> LatestNavigationEstimate | None:
        with self._lock:
            estimate = self._by_robot.get(robot_id)
            if (
                estimate is None
                or estimate.task_id != task_id
                or estimate.stage != stage
                or estimate.received_monotonic is None
            ):
                return None
            age = self._monotonic_clock() - estimate.received_monotonic
            if age < 0 or age > max_age_seconds:
                return None
            return estimate

    def clear_matching(
        self,
        robot_id: str,
        task_id: str,
        stage: str | None = None,
    ) -> bool:
        """Clear only the feedback belonging to the completed/cancelled task."""
        with self._lock:
            estimate = self._by_robot.get(robot_id)
            if (
                estimate is None
                or estimate.task_id != task_id
                or (stage is not None and estimate.stage != stage)
            ):
                return False
            del self._by_robot[robot_id]
            return True

    def clear_robot(self, robot_id: str) -> bool:
        with self._lock:
            return self._by_robot.pop(robot_id, None) is not None

    def clear(self) -> None:
        with self._lock:
            self._by_robot.clear()


navigation_feedback_store = NavigationFeedbackStore()
