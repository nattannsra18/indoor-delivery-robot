from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from ..auth import (
    SESSION_COOKIE_NAME, authenticate, clear_login_failures, create_session,
    record_login_failure, require_user, resolve_session_record,
)
import time
from ..config import security_settings
from ..database import get_db
from ..db_models import UserORM
from ..models import LoginRequest, UserIdentity, utc_now
from ..audit_service import AuditService
from ..browser_websocket_manager import browser_connection_manager

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post("/login", response_model=UserIdentity)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else 'unknown'}:{payload.username.casefold()}"
    user = authenticate(db, payload.username, payload.password)
    if user is None:
        AuditService(db).log(None, "auth.login", "session", None, result="failure")
        db.commit()
        time.sleep(record_login_failure(key))
        return Response(
            content='{"detail":"Invalid username or password"}',
            status_code=status.HTTP_401_UNAUTHORIZED,
            media_type="application/json",
        )
    clear_login_failures(key)
    AuditService(db).log(user.id, "auth.login", "session", None)
    db.commit()
    token, _ = create_session(db, user)
    settings = security_settings()
    response.set_cookie(
        SESSION_COOKIE_NAME, token, httponly=True, secure=settings.session_cookie_secure,
        samesite="lax", path="/", max_age=settings.session_ttl_seconds,
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    # Logout is intentionally idempotent. Only a currently valid session has
    # an authenticated actor and is revoked/audited in the same commit.
    resolved = resolve_session_record(
        db, request.cookies.get(SESSION_COOKIE_NAME)
    )
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
