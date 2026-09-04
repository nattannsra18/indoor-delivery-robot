from fastapi import APIRouter, Depends, Request, Response, status
from sqlalchemy.orm import Session

from ..auth import (
    SESSION_COOKIE_NAME, authenticate, clear_login_failures, create_session,
    record_login_failure, require_user, revoke_session,
)
import time
from ..config import security_settings
from ..database import get_db
from ..db_models import UserORM
from ..models import LoginRequest, UserIdentity

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post("/login", response_model=UserIdentity)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    key = f"{request.client.host if request.client else 'unknown'}:{payload.username.casefold()}"
    user = authenticate(db, payload.username, payload.password)
    if user is None:
        time.sleep(record_login_failure(key))
        return Response(
            content='{"detail":"Invalid username or password"}',
            status_code=status.HTTP_401_UNAUTHORIZED,
            media_type="application/json",
        )
    clear_login_failures(key)
    token, _ = create_session(db, user)
    settings = security_settings()
    response.set_cookie(
        SESSION_COOKIE_NAME, token, httponly=True, secure=settings.session_cookie_secure,
        samesite="lax", path="/", max_age=settings.session_ttl_seconds,
    )
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    revoke_session(db, request.cookies.get(SESSION_COOKIE_NAME))
    response.status_code = status.HTTP_204_NO_CONTENT
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return response


@router.get("/me", response_model=UserIdentity)
def me(user: UserORM = Depends(require_user)):
    return user
