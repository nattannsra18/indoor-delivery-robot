from fastapi import APIRouter, Depends, Query, status

from ..dependencies import get_service
from ..models import DeliveryTask, DeliveryTaskCreate, TaskEventRequest, TaskHistoryEntry, TaskStatus
from ..service import DeliveryService

router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("", response_model=list[DeliveryTask])
def list_tasks(
    task_status: TaskStatus | None = Query(default=None, alias="status"),
    service: DeliveryService = Depends(get_service),
):
    return service.list_tasks(task_status)


@router.get("/{task_id}", response_model=DeliveryTask)
def get_task(task_id: str, service: DeliveryService = Depends(get_service)):
    return service.get_task(task_id)


@router.get("/{task_id}/history", response_model=list[TaskHistoryEntry])
def get_task_history(task_id: str, service: DeliveryService = Depends(get_service)):
    return service.get_task_history(task_id)


@router.post("", response_model=DeliveryTask, status_code=status.HTTP_201_CREATED)
def create_task(payload: DeliveryTaskCreate, service: DeliveryService = Depends(get_service)):
    return service.create_task(payload)


@router.post("/{task_id}/events", response_model=DeliveryTask)
def apply_event(
    task_id: str,
    payload: TaskEventRequest,
    service: DeliveryService = Depends(get_service),
):
    return service.apply_task_event(task_id, payload.event, payload.source, payload.detail)


@router.post("/{task_id}/cancel", response_model=DeliveryTask)
def cancel_task(task_id: str, service: DeliveryService = Depends(get_service)):
    return service.cancel_task(task_id)


@router.post("/{task_id}/retry", response_model=DeliveryTask)
def retry_task(task_id: str, service: DeliveryService = Depends(get_service)):
    return service.retry_task(task_id)
