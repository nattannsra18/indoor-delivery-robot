from __future__ import annotations

import os
import secrets
import smtplib
import ssl
import time
from datetime import timedelta
from email.message import EmailMessage
from urllib.parse import urlencode
from uuid import uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import (
    SESSION_COOKIE_NAME,
    clear_login_failures,
    create_session,
    hash_password,
    record_login_failure,
    require_admin,
    require_user,
    resolve_session_record,
    token_digest,
    verify_credentials,
)
from ..browser_websocket_manager import browser_connection_manager
from ..config import security_settings
from ..database import get_db
from ..db_models import PasswordResetTokenORM, SessionORM, UserORM
from ..models import (
    ForgotPasswordRequest,
    ForgotPasswordResult,
    GoogleAuthConfiguration,
    LoginRequest,
    PendingAccount,
    ResetPasswordRequest,
    SignupRequest,
    SignupResult,
    UserIdentity,
    UserRole,
    utc_now,
)

router = APIRouter(prefix="/api/auth", tags=["authentication"])
GOOGLE_STATE_COOKIE = "idr_google_oauth_state"


def _set_session_cookie(response: Response, token: str) -> None:
    settings = security_settings()
    response.set_cookie(
        SESSION_COOKIE_NAME,
        token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
        max_age=settings.session_ttl_seconds,
    )


def _frontend_redirect(**parameters: str) -> str:
    base = os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")
    return f"{base}/login?{urlencode(parameters)}"


def _google_settings() -> tuple[str, str, str] | None:
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv(
        "GOOGLE_REDIRECT_URI", "http://localhost:8000/api/auth/google/callback"
    ).strip()
    if not client_id or not client_secret:
        return None
    return client_id, client_secret, redirect_uri


def _smtp_configured() -> bool:
    return bool(
        os.getenv("SMTP_HOST", "").strip()
        and os.getenv("SMTP_FROM_EMAIL", "").strip()
    )


def _send_reset_email(recipient: str, token: str) -> None:
    host = os.getenv("SMTP_HOST", "").strip()
    sender = os.getenv("SMTP_FROM_EMAIL", "").strip()
    if not host or not sender:
        return
    port = int(os.getenv("SMTP_PORT", "587"))
    reset_base = os.getenv(
        "PASSWORD_RESET_URL_BASE", "http://localhost:3000/reset-password"
    )
    reset_url = f"{reset_base}?{urlencode({'token': token})}"
    message = EmailMessage()
    message["Subject"] = "Reset your Delivery Robot password"
    message["From"] = sender
    message["To"] = recipient
    message.set_content(
        "A password reset was requested for your Delivery Robot account.\n\n"
        f"Reset password: {reset_url}\n\n"
        "This link expires in 30 minutes. If you did not request this, ignore this email."
    )
    with smtplib.SMTP(host, port, timeout=10) as smtp:
        if os.getenv("SMTP_USE_TLS", "true").strip().lower() in {"1", "true", "yes", "on"}:
            smtp.starttls(context=ssl.create_default_context())
        username = os.getenv("SMTP_USERNAME", "").strip()
        password = os.getenv("SMTP_PASSWORD", "")
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


@router.post("/login", response_model=UserIdentity)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    identifier = payload.login_identifier
    key = f"{request.client.host if request.client else 'unknown'}:{identifier.casefold()}"
    user = verify_credentials(db, identifier, payload.password)
    if user is None:
        AuditService(db).log(None, "auth.login", "session", None, result="failure")
        db.commit()
        time.sleep(record_login_failure(key))
        return Response(
            content='{"detail":"Invalid email, username or password"}',
            status_code=status.HTTP_401_UNAUTHORIZED,
            media_type="application/json",
        )
    if not user.active:
        clear_login_failures(key)
        return Response(
            content='{"detail":"Account pending approval"}',
            status_code=status.HTTP_403_FORBIDDEN,
            media_type="application/json",
        )
    clear_login_failures(key)
    AuditService(db).log(user.id, "auth.login", "session", None)
    db.commit()
    token, _ = create_session(db, user)
    _set_session_cookie(response, token)
    return user


@router.post("/signup", response_model=SignupResult, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    duplicate = db.scalar(
        select(UserORM.id).where(
            or_(
                func.lower(UserORM.username) == payload.username.casefold(),
                func.lower(UserORM.email) == payload.email,
            )
        )
    )
    if duplicate is not None:
        return Response(
            content='{"detail":"Email or username is already registered"}',
            status_code=status.HTTP_409_CONFLICT,
            media_type="application/json",
        )
    user = UserORM(
        id=str(uuid4()),
        email=payload.email,
        username=payload.username,
        password_hash=hash_password(payload.password),
        role=UserRole.USER,
        active=False,
    )
    db.add(user)
    AuditService(db).log(user.id, "auth.signup", "user", user.id)
    db.commit()
    return SignupResult(status="PENDING_APPROVAL")


@router.get("/pending-accounts", response_model=list[PendingAccount])
def pending_accounts(
    _: UserORM = Depends(require_admin), db: Session = Depends(get_db)
):
    return list(
        db.scalars(
            select(UserORM)
            .where(UserORM.active.is_(False), UserORM.role == UserRole.USER)
            .order_by(UserORM.created_at.asc())
        ).all()
    )


@router.post("/accounts/{user_id}/approve", response_model=UserIdentity)
def approve_account(
    user_id: str,
    admin: UserORM = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.get(UserORM, user_id)
    if user is None or user.role != UserRole.USER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found")
    user.active = True
    AuditService(db).log(admin.id, "auth.account_approved", "user", user.id)
    db.commit()
    return user


@router.post("/forgot-password", response_model=ForgotPasswordResult)
def forgot_password(
    payload: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    configured = _smtp_configured()
    normalized = payload.email.strip().casefold()
    user = db.scalar(select(UserORM).where(func.lower(UserORM.email) == normalized))
    if user is not None and configured:
        raw_token = secrets.token_urlsafe(48)
        db.execute(delete(PasswordResetTokenORM).where(PasswordResetTokenORM.user_id == user.id))
        db.add(
            PasswordResetTokenORM(
                id=str(uuid4()),
                token_hash=token_digest(raw_token),
                user_id=user.id,
                expires_at=utc_now() + timedelta(minutes=30),
            )
        )
        db.commit()
        background_tasks.add_task(_send_reset_email, normalized, raw_token)
    return ForgotPasswordResult(accepted=True, delivery_configured=configured)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset = db.scalar(
        select(PasswordResetTokenORM).where(
            PasswordResetTokenORM.token_hash == token_digest(payload.token),
            PasswordResetTokenORM.used_at.is_(None),
        )
    )
    if reset is None:
        return Response(status_code=status.HTTP_400_BAD_REQUEST, content='{"detail":"Invalid or expired reset link"}', media_type="application/json")
    expires_at = reset.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=utc_now().tzinfo)
    if expires_at <= utc_now():
        return Response(status_code=status.HTTP_400_BAD_REQUEST, content='{"detail":"Invalid or expired reset link"}', media_type="application/json")
    user = db.get(UserORM, reset.user_id)
    if user is None:
        return Response(status_code=status.HTTP_400_BAD_REQUEST, content='{"detail":"Invalid or expired reset link"}', media_type="application/json")
    session_ids = list(
        db.scalars(select(SessionORM.id).where(SessionORM.user_id == user.id)).all()
    )
    user.password_hash = hash_password(payload.password)
    reset.used_at = utc_now()
    db.execute(delete(SessionORM).where(SessionORM.user_id == user.id))
    AuditService(db).log(user.id, "auth.password_reset", "user", user.id)
    db.commit()
    for session_id in session_ids:
        browser_connection_manager.disconnect_session(session_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/google/config", response_model=GoogleAuthConfiguration)
def google_configuration():
    return GoogleAuthConfiguration(enabled=_google_settings() is not None)


@router.get("/google/start")
def google_start():
    settings = _google_settings()
    if settings is None:
        return RedirectResponse(_frontend_redirect(error="google_not_configured"))
    client_id, _, redirect_uri = settings
    state = secrets.token_urlsafe(32)
    destination = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(destination)
    response.set_cookie(
        GOOGLE_STATE_COOKIE,
        state,
        httponly=True,
        secure=security_settings().session_cookie_secure,
        samesite="lax",
        path="/api/auth/google",
        max_age=600,
    )
    return response


@router.get("/google/callback")
def google_callback(request: Request, code: str = "", state: str = "", db: Session = Depends(get_db)):
    settings = _google_settings()
    expected_state = request.cookies.get(GOOGLE_STATE_COOKIE)
    if settings is None or not code or not state or not expected_state or not secrets.compare_digest(state, expected_state):
        return RedirectResponse(_frontend_redirect(error="google_failed"))
    client_id, client_secret, redirect_uri = settings
    try:
        with httpx.Client(timeout=10) as client:
            token_response = client.post(
                "https://oauth2.googleapis.com/token",
                data={"code": code, "client_id": client_id, "client_secret": client_secret, "redirect_uri": redirect_uri, "grant_type": "authorization_code"},
            )
            token_response.raise_for_status()
            access_token = token_response.json()["access_token"]
            profile_response = client.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            profile_response.raise_for_status()
            profile = profile_response.json()
    except (httpx.HTTPError, KeyError, ValueError):
        return RedirectResponse(_frontend_redirect(error="google_failed"))
    email = str(profile.get("email", "")).strip().casefold()
    subject = str(profile.get("sub", "")).strip()
    if not email or not subject or profile.get("email_verified") is not True:
        return RedirectResponse(_frontend_redirect(error="google_failed"))
    user = db.scalar(select(UserORM).where(or_(UserORM.google_subject == subject, func.lower(UserORM.email) == email)))
    if user is None:
        stem = "".join(character for character in email.split("@", 1)[0] if character.isalnum() or character in "_.-")[:80] or "user"
        username = stem
        suffix = 1
        while db.scalar(select(UserORM.id).where(func.lower(UserORM.username) == username.casefold())):
            suffix += 1
            username = f"{stem[:90]}-{suffix}"
        user = UserORM(id=str(uuid4()), email=email, google_subject=subject, username=username, password_hash=hash_password(secrets.token_urlsafe(48)), role=UserRole.USER, active=False)
        db.add(user)
        db.commit()
    elif user.google_subject is None:
        user.google_subject = subject
        db.commit()
    if not user.active:
        response = RedirectResponse(_frontend_redirect(status="pending"))
        response.delete_cookie(GOOGLE_STATE_COOKIE, path="/api/auth/google")
        return response
    token, _ = create_session(db, user)
    response = RedirectResponse(os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/") + "/")
    response.delete_cookie(GOOGLE_STATE_COOKIE, path="/api/auth/google")
    _set_session_cookie(response, token)
    return response


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    resolved = resolve_session_record(db, request.cookies.get(SESSION_COOKIE_NAME))
    revoked_session_id = None
    if resolved is not None:
        user, session = resolved
        AuditService(db).log(user.id, "auth.logout", "session", session.id)
        session.revoked_at = utc_now()
        db.commit()
        revoked_session_id = session.id
    else:
        db.rollback()
    browser_connection_manager.disconnect_session(revoked_session_id)
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@router.get("/me", response_model=UserIdentity)
def me(user: UserORM = Depends(require_user)):
    return user
