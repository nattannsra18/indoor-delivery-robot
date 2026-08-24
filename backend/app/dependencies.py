from fastapi import Depends
from sqlalchemy.orm import Session

from .database import get_db
from .service import DeliveryService


def get_service(db: Session = Depends(get_db)) -> DeliveryService:
    return DeliveryService(db)
