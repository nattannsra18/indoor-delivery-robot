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
    robot_enrollment_token: str | None
    robot_enrollment_enabled: bool
    robot_enrollment_ttl_seconds: int
    allow_legacy_robot_token: bool
    emergency_command_timeout_seconds: int
    map_command_timeout_seconds: int
    password_min_length: int


def security_settings() -> SecuritySettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    robot_token = os.getenv("ROBOT_WS_TOKEN") or None
    required = _bool_env("ROBOT_WS_AUTH_REQUIRED", app_env == "production")
    enrollment_token = os.getenv("ROBOT_ENROLLMENT_TOKEN") or None
    enrollment_enabled = _bool_env("ROBOT_ENROLLMENT_ENABLED", True)
    allow_legacy = _bool_env("ALLOW_LEGACY_ROBOT_TOKEN", app_env != "production")
    if app_env == "production" and allow_legacy and not robot_token:
        raise RuntimeError("ROBOT_WS_TOKEN is required in production")
    if app_env == "production" and enrollment_enabled and not enrollment_token:
        raise RuntimeError("ROBOT_ENROLLMENT_TOKEN is required when enrollment is enabled")
    return SecuritySettings(
        app_env=app_env,
        session_cookie_secure=_bool_env("SESSION_COOKIE_SECURE", app_env == "production"),
        session_ttl_seconds=max(60, int(os.getenv("SESSION_TTL_SECONDS", "43200"))),
        robot_ws_token=robot_token,
        robot_ws_auth_required=required,
        robot_enrollment_token=enrollment_token,
        robot_enrollment_enabled=enrollment_enabled,
        robot_enrollment_ttl_seconds=max(
            120, int(os.getenv("ROBOT_ENROLLMENT_TTL_SECONDS", "600"))
        ),
        allow_legacy_robot_token=allow_legacy,
        emergency_command_timeout_seconds=max(
            1, int(os.getenv("EMERGENCY_COMMAND_TIMEOUT_SECONDS", "10"))
        ),
        map_command_timeout_seconds=max(
            2, int(os.getenv("MAP_COMMAND_TIMEOUT_SECONDS", "10"))
        ),
        password_min_length=max(8, int(os.getenv("PASSWORD_MIN_LENGTH", "8"))),
    )
