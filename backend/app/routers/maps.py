from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..audit_service import AuditService
from ..auth import require_admin, require_user
from ..database import get_db
from ..db_models import MapMetadataORM, UserORM

from ..map_store import map_store
from ..models import MapMetadata, MapMetadataUpdate, MapSnapshot, utc_now

router = APIRouter(
    prefix="/api/map",
    tags=["map"], dependencies=[Depends(require_user)],
)


@router.get("/metadata", response_model=MapMetadata)
def get_map_metadata(db: Session = Depends(get_db)) -> MapMetadataORM:
    metadata = db.get(MapMetadataORM, "active")
    if metadata is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Map metadata has not been configured",
        )
    return metadata


@router.put("/metadata", response_model=MapMetadata)
def update_map_metadata(
    payload: MapMetadataUpdate,
    db: Session = Depends(get_db),
    user: UserORM = Depends(require_admin),
) -> MapMetadataORM:
    metadata = db.get(MapMetadataORM, "active")
    if metadata is None:
        metadata = MapMetadataORM(id="active", **payload.model_dump())
        db.add(metadata)
    else:
        for field, value in payload.model_dump().items():
            setattr(metadata, field, value)
        metadata.updated_at = utc_now()
    AuditService(db).log(user.id, "map.metadata_updated", "map", "active")
    db.commit()
    db.refresh(metadata)
    return metadata


@router.get("", response_model=MapSnapshot)
def get_map() -> MapSnapshot:
    snapshot = map_store.get()

    if snapshot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="ROS map has not been received",
        )

    return snapshot
