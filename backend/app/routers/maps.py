from fastapi import APIRouter, HTTPException, status

from ..map_store import map_store
from ..models import MapSnapshot

router = APIRouter(
    prefix="/api/map",
    tags=["map"],
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
