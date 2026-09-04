from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from ..audit_service import ALLOWED_ACTION_FILTERS, AuditService
from ..auth import require_admin
from ..database import get_db
from ..models import AuditPage
router = APIRouter(prefix="/api/audit", tags=["audit"])
@router.get("", response_model=AuditPage, dependencies=[Depends(require_admin)])
def list_audit(offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), action: str | None = Query(None, max_length=80), db: Session = Depends(get_db)):
    if action is not None and action not in ALLOWED_ACTION_FILTERS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Unsupported audit action filter")
    items, next_offset = AuditService(db).list(offset, limit, action); return {"items": items, "next_offset": next_offset}
