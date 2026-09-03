from __future__ import annotations

import os
from dataclasses import dataclass


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class SecuritySettings:
    app_env: str
    session_cookie_secure: bool
    session_ttl_seconds: int
    robot_ws_token: str | None
    robot_ws_auth_required: bool
    emergency_command_timeout_seconds: int


def security_settings() -> SecuritySettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    robot_token = os.getenv("ROBOT_WS_TOKEN") or None
    required = _bool_env("ROBOT_WS_AUTH_REQUIRED", app_env == "production")
    if app_env == "production" and not robot_token:
        raise RuntimeError("ROBOT_WS_TOKEN is required in production")
    return SecuritySettings(
        app_env=app_env,
        session_cookie_secure=_bool_env("SESSION_COOKIE_SECURE", app_env == "production"),
        session_ttl_seconds=max(60, int(os.getenv("SESSION_TTL_SECONDS", "43200"))),
        robot_ws_token=robot_token,
        robot_ws_auth_required=required,
        emergency_command_timeout_seconds=max(
            1, int(os.getenv("EMERGENCY_COMMAND_TIMEOUT_SECONDS", "10"))
        ),
    )
