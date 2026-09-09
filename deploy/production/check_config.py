#!/usr/bin/env python3
from __future__ import annotations

import sys
from pathlib import Path
from urllib.parse import urlparse


PLACEHOLDERS = ("replace-with", "example.com")


def load_environment(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines(),
        start=1,
    ):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise ValueError(f"{path}:{line_number}: expected KEY=VALUE")
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip("\"").strip("'")
    return values


def validate(values: dict[str, str], base_directory: Path) -> list[str]:
    errors: list[str] = []
    required = (
        "APP_DOMAIN",
        "APP_ENV",
        "FRONTEND_URL",
        "CORS_ALLOWED_ORIGINS",
        "TRUSTED_HOSTS",
        "POSTGRES_PASSWORD",
        "DATABASE_URL",
        "BOOTSTRAP_ADMIN_PASSWORD",
        "ROBOT_ENROLLMENT_TOKEN",
    )
    for key in required:
        if not values.get(key):
            errors.append(f"{key} is required")

    domain = values.get("APP_DOMAIN", "")
    frontend_url = values.get("FRONTEND_URL", "")
    parsed_frontend = urlparse(frontend_url)
    if parsed_frontend.scheme != "https" or parsed_frontend.hostname != domain:
        errors.append("FRONTEND_URL must be https://APP_DOMAIN")
    origins = [
        item.strip()
        for item in values.get("CORS_ALLOWED_ORIGINS", "").split(",")
        if item.strip()
    ]
    if not origins or any(urlparse(item).scheme != "https" for item in origins):
        errors.append("CORS_ALLOWED_ORIGINS must contain only HTTPS origins")
    trusted_hosts = {
        item.strip()
        for item in values.get("TRUSTED_HOSTS", "").split(",")
        if item.strip()
    }
    if domain not in trusted_hosts or "*" in trusted_hosts:
        errors.append("TRUSTED_HOSTS must explicitly include APP_DOMAIN and cannot use *")

    expected = {
        "APP_ENV": "production",
        "SESSION_COOKIE_SECURE": "true",
        "ROBOT_WS_AUTH_REQUIRED": "true",
        "ALLOW_LEGACY_ROBOT_TOKEN": "false",
    }
    for key, expected_value in expected.items():
        if values.get(key, "").lower() != expected_value:
            errors.append(f"{key} must be {expected_value}")

    for key, minimum in (
        ("POSTGRES_PASSWORD", 24),
        ("BOOTSTRAP_ADMIN_PASSWORD", 16),
        ("ROBOT_ENROLLMENT_TOKEN", 32),
    ):
        value = values.get(key, "")
        if len(value) < minimum:
            errors.append(f"{key} must contain at least {minimum} characters")
        if any(marker in value.lower() for marker in PLACEHOLDERS):
            errors.append(f"{key} still contains an example placeholder")

    database_url = values.get("DATABASE_URL", "")
    parsed_database = urlparse(database_url)
    if parsed_database.scheme != "postgresql+psycopg" or parsed_database.hostname != "postgres":
        errors.append("DATABASE_URL must use postgresql+psycopg and the private postgres service")
    if any(marker in database_url.lower() for marker in PLACEHOLDERS):
        errors.append("DATABASE_URL still contains an example placeholder")

    caddyfile = values.get("CADDYFILE", "./Caddyfile")
    if not (base_directory / caddyfile).resolve().is_file():
        errors.append(f"CADDYFILE does not exist: {caddyfile}")
    if caddyfile.endswith("Caddyfile") and not values.get("ACME_EMAIL"):
        errors.append("ACME_EMAIL is required for the public Caddyfile")

    return errors


def main() -> int:
    path = Path(sys.argv[1] if len(sys.argv) > 1 else ".env.production").resolve()
    if not path.is_file():
        print(f"Configuration file not found: {path}", file=sys.stderr)
        return 2
    try:
        values = load_environment(path)
    except (OSError, ValueError) as error:
        print(error, file=sys.stderr)
        return 2
    errors = validate(values, path.parent)
    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print(f"Production configuration is valid for https://{values['APP_DOMAIN']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
