from app.models import RobotOperationAction, RobotOperationStatus
from app.robot_operation_store import RobotOperationStore


def test_robot_operation_tracks_agent_lifecycle_and_failure_category():
    store = RobotOperationStore()
    operation = store.begin("robot01", RobotOperationAction.RECOVER_NAVIGATION)
    assert operation.status == RobotOperationStatus.PENDING

    accepted = store.update(
        operation.command_id,
        "robot01",
        "accepted",
        "Robot operation accepted",
    )
    assert accepted is not None
    assert accepted.status == RobotOperationStatus.ACCEPTED

    failed = store.update(
        operation.command_id,
        "robot01",
        "failed",
        "Start blocked: planner rejected the start pose",
    )
    assert failed is not None
    assert failed.status == RobotOperationStatus.FAILED
    assert failed.failure_category is not None
    assert failed.failure_category.value == "Start blocked"


def test_robot_operation_ignores_status_for_another_robot():
    store = RobotOperationStore()
    operation = store.begin("robot01", RobotOperationAction.STOP_ROBOT_STACK)
    assert store.update(
        operation.command_id,
        "robot02",
        "succeeded",
        "wrong robot",
    ) is None
    assert store.latest("robot01").status == RobotOperationStatus.PENDING
