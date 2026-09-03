from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from uuid import uuid4

from .models import NavigationPathMessage, NavigationStage


@dataclass(frozen=True)
class ActiveNavigationCommand:
    robot_id: str
    command_id: str
    task_id: str
    stage: NavigationStage


class NavigationPathStore:
    """Keeps transient command identity and the latest Nav2 path."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._commands: dict[str, ActiveNavigationCommand] = {}
        self._paths: dict[str, NavigationPathMessage] = {}

    def command_for(
        self,
        robot_id: str,
        task_id: str,
        stage: NavigationStage,
    ) -> ActiveNavigationCommand:
        with self._lock:
            current = self._commands.get(robot_id)
            if (
                current is not None
                and current.task_id == task_id
                and current.stage == stage
            ):
                return current

            command = ActiveNavigationCommand(
                robot_id=robot_id,
                command_id=f"{task_id}:{stage}:{uuid4().hex}",
                task_id=task_id,
                stage=stage,
            )
            self._commands[robot_id] = command
            self._paths.pop(robot_id, None)
            return command

    def active_command(
        self,
        robot_id: str,
    ) -> ActiveNavigationCommand | None:
        with self._lock:
            return self._commands.get(robot_id)

    def matches(
        self,
        robot_id: str,
        command_id: str,
        task_id: str,
        stage: NavigationStage,
    ) -> bool:
        with self._lock:
            current = self._commands.get(robot_id)
            return bool(
                current is not None
                and current.command_id == command_id
                and current.task_id == task_id
                and current.stage == stage
            )

    def update(
        self,
        robot_id: str,
        path: NavigationPathMessage,
    ) -> bool:
        with self._lock:
            command = self._commands.get(robot_id)
            if (
                command is None
                or command.command_id != path.command_id
                or command.task_id != path.task_id
                or command.stage != path.stage
            ):
                return False

            self._paths[robot_id] = path.model_copy(deep=True)
            return True

    def get(
        self,
        robot_id: str,
    ) -> NavigationPathMessage | None:
        with self._lock:
            path = self._paths.get(robot_id)
            return (
                path.model_copy(deep=True)
                if path is not None
                else None
            )

    def all_paths(
        self,
    ) -> list[tuple[str, NavigationPathMessage]]:
        with self._lock:
            return [
                (robot_id, path.model_copy(deep=True))
                for robot_id, path in self._paths.items()
            ]

    def clear_path(
        self,
        robot_id: str,
    ) -> ActiveNavigationCommand | None:
        with self._lock:
            self._paths.pop(robot_id, None)
            return self._commands.get(robot_id)

    def clear(
        self,
        robot_id: str,
    ) -> ActiveNavigationCommand | None:
        with self._lock:
            self._paths.pop(robot_id, None)
            return self._commands.pop(robot_id, None)

    def clear_all(self) -> None:
        with self._lock:
            self._paths.clear()
            self._commands.clear()


navigation_path_store = NavigationPathStore()
