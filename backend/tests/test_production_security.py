from pathlib import Path

import pytest

from app.config import security_settings
from app.rate_limit import SlidingWindowRateLimiter


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]


def production_environment(monkeypatch) -> None:
    values = {
        "APP_ENV": "production",
        "FRONTEND_URL": "https://robot.example.test",
        "CORS_ALLOWED_ORIGINS": "https://robot.example.test",
        "TRUSTED_HOSTS": "robot.example.test",
        "SESSION_COOKIE_SECURE": "true",
        "ROBOT_WS_AUTH_REQUIRED": "true",
        "ALLOW_LEGACY_ROBOT_TOKEN": "false",
        "ROBOT_ENROLLMENT_ENABLED": "true",
        "ROBOT_ENROLLMENT_TOKEN": "e" * 48,
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)


def test_production_security_settings_fail_closed(monkeypatch):
    production_environment(monkeypatch)
    settings = security_settings()
    assert settings.session_cookie_secure is True
    assert settings.allow_legacy_robot_token is False
    assert settings.trusted_hosts == ("robot.example.test",)

    unsafe_values = {
        "ALLOW_LEGACY_ROBOT_TOKEN": "true",
        "ROBOT_WS_AUTH_REQUIRED": "false",
        "SESSION_COOKIE_SECURE": "false",
        "TRUSTED_HOSTS": "*",
        "FRONTEND_URL": "http://robot.example.test",
        "CORS_ALLOWED_ORIGINS": "http://robot.example.test",
        "ROBOT_ENROLLMENT_TOKEN": "short",
    }
    for key, value in unsafe_values.items():
        production_environment(monkeypatch)
        monkeypatch.setenv(key, value)
        with pytest.raises(RuntimeError):
            security_settings()


def test_enrollment_rate_limiter_uses_a_sliding_window():
    now = [100.0]
    limiter = SlidingWindowRateLimiter(clock=lambda: now[0])

    assert limiter.check("create:client", limit=2, window_seconds=60) is None
    assert limiter.check("create:client", limit=2, window_seconds=60) is None
    assert limiter.check("create:client", limit=2, window_seconds=60) == 60
    assert limiter.check("claim:client", limit=2, window_seconds=60) is None

    now[0] = 161.0
    assert limiter.check("create:client", limit=2, window_seconds=60) is None


def test_production_compose_exposes_only_the_tls_proxy():
    compose = (
        REPOSITORY_ROOT / "deploy" / "production" / "compose.yml"
    ).read_text(encoding="utf-8")
    caddy = (
        REPOSITORY_ROOT / "deploy" / "production" / "Caddyfile"
    ).read_text(encoding="utf-8")

    assert '"80:80"' in compose
    assert '"443:443"' in compose
    assert '"3000:3000"' not in compose
    assert '"5432:5432"' not in compose
    assert '"8000:8000"' not in compose
    assert "internal: true" in compose
    assert "@backend path /api/* /ws/* /health" in caddy
    assert "Strict-Transport-Security" in caddy
