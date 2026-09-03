from fastapi import APIRouter, Depends, HTTPException, status
from ..auth import require_user

from ..map_store import map_store
from ..models import MapSnapshot

router = APIRouter(
    prefix="/api/map",
    tags=["map"], dependencies=[Depends(require_user)],
)


@router.get("", response_model=MapSnapshot)
def get_map() -> MapSnapshot:
    snapshot = map_store.get()

    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ROS map has not been received",
        )

    return snapshot
