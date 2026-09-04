from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from ..auth import require_user
from ..database import get_db
from ..db_models import UserORM
from ..models import Notification, NotificationPage
from ..notification_service import NotificationService
router = APIRouter(prefix="/api/notifications", tags=["notifications"])
@router.get("", response_model=NotificationPage)
def list_notifications(offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db), user: UserORM = Depends(require_user)):
    items, unread, next_offset = NotificationService(db).list(user.id, offset, limit); return {"items": items, "unread_count": unread, "next_offset": next_offset}
@router.post("/{notification_id}/read", response_model=Notification)
def read_notification(notification_id: str, db: Session = Depends(get_db), user: UserORM = Depends(require_user)):
    item = NotificationService(db).mark_read(user.id, notification_id)
    if item is None: raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return item
@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def read_all(db: Session = Depends(get_db), user: UserORM = Depends(require_user)):
    NotificationService(db).mark_all_read(user.id)
