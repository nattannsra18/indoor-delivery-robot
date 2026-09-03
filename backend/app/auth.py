from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import os
import secrets
import threading
import time
from collections import OrderedDict
from datetime import timedelta
from uuid import uuid4

from fastapi import Depends, HTTPException, Request, WebSocket, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import security_settings
from .database import get_db
from .db_models import SessionORM, UserORM
from .models import UserRole, utc_now

SESSION_COOKIE_NAME = "idr_session"
PBKDF2_ITERATIONS = 600_000
_attempts: OrderedDict[str, tuple[int, float]] = OrderedDict()
_attempt_lock = threading.Lock()
_DUMMY_HASH: str | None = None


def hash_password(password: str, *, iterations: int = PBKDF2_ITERATIONS) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iterations)
    return "pbkdf2_sha256${}${}${}".format(
        iterations,
        base64.urlsafe_b64encode(salt).decode(),
        base64.urlsafe_b64encode(digest).decode(),
    )


def verify_password(password: str, stored: str) -> bool:
    try:
        algorithm, rounds, encoded_salt, encoded_digest = stored.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode(), base64.urlsafe_b64decode(encoded_salt), int(rounds)
        )
        return hmac.compare_digest(actual, base64.urlsafe_b64decode(encoded_digest))
    except (ValueError, TypeError):
        return False


def _dummy_hash() -> str:
    global _DUMMY_HASH
    if _DUMMY_HASH is None:
        _DUMMY_HASH = hash_password("not-the-password")
    return _DUMMY_HASH


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def robot_authorization_valid(
    authorization: str,
    expected_token: str | None,
    required: bool,
) -> bool:
    if expected_token is None:
        return not required
    return hmac.compare_digest(authorization, f"Bearer {expected_token}")


def authenticate(db: Session, username: str, password: str) -> UserORM | None:
    user = db.scalar(select(UserORM).where(UserORM.username == username))
    valid = verify_password(password, user.password_hash if user else _dummy_hash())
    return user if user is not None and user.active and valid else None


def create_session(db: Session, user: UserORM) -> tuple[str, SessionORM]:
    token = secrets.token_urlsafe(48)
    session = SessionORM(
        id=str(uuid4()),
        token_hash=token_digest(token),
        user_id=user.id,
        expires_at=utc_now() + timedelta(seconds=security_settings().session_ttl_seconds),
    )
    db.add(session)
    db.commit()
    return token, session


def resolve_session(db: Session, token: str | None) -> UserORM | None:
    if not token:
        return None
    session = db.scalar(select(SessionORM).where(SessionORM.token_hash == token_digest(token)))
    if session is None or session.revoked_at is not None:
        return None
    expires_at = session.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=utc_now().tzinfo)
    if expires_at <= utc_now():
        return None
    user = db.get(UserORM, session.user_id)
    return user if user is not None and user.active else None


def revoke_session(db: Session, token: str | None) -> None:
    if not token:
        return
    session = db.scalar(select(SessionORM).where(SessionORM.token_hash == token_digest(token)))
    if session is not None and session.revoked_at is None:
        session.revoked_at = utc_now()
        db.commit()


def require_user(request: Request, db: Session = Depends(get_db)) -> UserORM:
    user = resolve_session(db, request.cookies.get(SESSION_COOKIE_NAME))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def require_admin(user: UserORM = Depends(require_user)) -> UserORM:
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Administrator access required")
    return user


def websocket_user(websocket: WebSocket, db: Session) -> UserORM | None:
    return resolve_session(db, websocket.cookies.get(SESSION_COOKIE_NAME))


def record_login_failure(key: str) -> float:
    now = time.monotonic()
    with _attempt_lock:
        count, previous = _attempts.get(key, (0, now))
        if now - previous > 300:
            count = 0
        count += 1
        _attempts[key] = (count, now)
        while len(_attempts) > 1000:
            _attempts.popitem(last=False)
    return min(0.75, 0.1 * count)


def clear_login_failures(key: str) -> None:
    with _attempt_lock:
        _attempts.pop(key, None)


async def login_delay(seconds: float) -> None:
    await asyncio.sleep(seconds)


def bootstrap_admin(db: Session) -> None:
    username = os.getenv("BOOTSTRAP_ADMIN_USERNAME", "").strip()
    password = os.getenv("BOOTSTRAP_ADMIN_PASSWORD", "")
    existing_admin = db.scalar(
        select(UserORM).where(UserORM.role == UserRole.ADMIN, UserORM.active.is_(True)).limit(1)
    )
    if existing_admin is not None or not username or not password:
        return
    if security_settings().app_env == "production" and len(password) < 12:
        raise RuntimeError("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters")
    existing = db.scalar(select(UserORM).where(UserORM.username == username))
    if existing is not None:
        return
    db.add(
        UserORM(
            id=str(uuid4()), username=username, password_hash=hash_password(password), role=UserRole.ADMIN
        )
    )
    db.commit()
