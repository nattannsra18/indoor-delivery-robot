from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import urlparse


def _bool_env(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: str) -> tuple[str, ...]:
    return tuple(
        item.strip()
        for item in os.getenv(name, default).split(",")
        if item.strip()
    )


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
    trusted_hosts: tuple[str, ...]
    cors_allowed_origins: tuple[str, ...]
    robot_enrollment_rate_limit: int
    robot_enrollment_rate_window_seconds: int


def security_settings() -> SecuritySettings:
    app_env = os.getenv("APP_ENV", "development").strip().lower()
    robot_token = os.getenv("ROBOT_WS_TOKEN") or None
    required = _bool_env("ROBOT_WS_AUTH_REQUIRED", app_env == "production")
    enrollment_token = os.getenv("ROBOT_ENROLLMENT_TOKEN") or None
    enrollment_enabled = _bool_env("ROBOT_ENROLLMENT_ENABLED", True)
    allow_legacy = _bool_env("ALLOW_LEGACY_ROBOT_TOKEN", app_env != "production")
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000").strip().rstrip("/")
    trusted_hosts = _csv_env(
        "TRUSTED_HOSTS",
        "localhost,127.0.0.1,testserver",
    )
    cors_origins = _csv_env("CORS_ALLOWED_ORIGINS", frontend_url)
    session_cookie_secure = _bool_env(
        "SESSION_COOKIE_SECURE",
        app_env == "production",
    )

    if app_env == "production":
        if allow_legacy:
            raise RuntimeError("ALLOW_LEGACY_ROBOT_TOKEN must be false in production")
        if not required:
            raise RuntimeError("ROBOT_WS_AUTH_REQUIRED must be true in production")
        if not session_cookie_secure:
            raise RuntimeError("SESSION_COOKIE_SECURE must be true in production")
        if not trusted_hosts or "*" in trusted_hosts:
            raise RuntimeError("TRUSTED_HOSTS must explicitly list production hosts")
        if urlparse(frontend_url).scheme != "https":
            raise RuntimeError("FRONTEND_URL must use https in production")
        if not cors_origins or any(
            urlparse(origin).scheme != "https" for origin in cors_origins
        ):
            raise RuntimeError("CORS_ALLOWED_ORIGINS must contain only https origins")
        if enrollment_enabled and (
            enrollment_token is None or len(enrollment_token) < 32
        ):
            raise RuntimeError(
                "ROBOT_ENROLLMENT_TOKEN must contain at least 32 characters "
                "when production enrollment is enabled"
            )
    return SecuritySettings(
        app_env=app_env,
        session_cookie_secure=session_cookie_secure,
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
        trusted_hosts=trusted_hosts,
        cors_allowed_origins=cors_origins,
        robot_enrollment_rate_limit=max(
            1, int(os.getenv("ROBOT_ENROLLMENT_RATE_LIMIT", "6"))
        ),
        robot_enrollment_rate_window_seconds=max(
            1,
            int(os.getenv("ROBOT_ENROLLMENT_RATE_WINDOW_SECONDS", "60")),
        ),
    )
