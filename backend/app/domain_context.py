"""Trusted, server-created identity for domain side effects.

This object is intentionally not a Pydantic request model: public clients can
never submit an actor, role, recipient, or audit action.
"""
from __future__ import annotations
from dataclasses import dataclass
from enum import StrEnum
from .db_models import UserORM


class ActorType(StrEnum):
    USER = "USER"
    ROBOT = "ROBOT"
    SYSTEM = "SYSTEM"


@dataclass(frozen=True)
class TrustedActor:
    actor_type: ActorType
    user_id: str | None = None
    robot_id: str | None = None

    @classmethod
    def user(cls, user: UserORM) -> "TrustedActor":
        return cls(ActorType.USER, user_id=user.id)

    @classmethod
    def robot(cls, robot_id: str) -> "TrustedActor":
        return cls(ActorType.ROBOT, robot_id=robot_id)

    @classmethod
    def system(cls) -> "TrustedActor":
        return cls(ActorType.SYSTEM)
