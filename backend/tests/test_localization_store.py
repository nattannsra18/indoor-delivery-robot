from app.localization_store import LocalizationStore
from app.models import (
    AmclLifecycleState,
    LocalizationCommandAction,
    LocalizationHealth,
    LocalizationReason,
    RobotLocalizationStatusMessage,
)


def test_localization_command_id_fits_wire_contract_for_uuid_robot_id():
    store = LocalizationStore()

    status, command_id = store.request(
        "20b63d69-b95f-4710-a6d4-4ee50fa26e9d",
        LocalizationCommandAction.GLOBAL_LOCALIZATION,
    )

    assert len(command_id) <= 100
    assert status.pending_command_id == command_id
    assert "global_localization" in command_id


def test_mark_offline_tolerates_legacy_oversized_command_id():
    store = LocalizationStore()
    status, _ = store.request(
        "robot01",
        LocalizationCommandAction.GLOBAL_LOCALIZATION,
    )
    legacy_id = (
        "localization-global_localization:"
        "20b63d69-b95f-4710-a6d4-4ee50fa26e9d:"
        + "a" * 32
    )
    store._statuses["robot01"] = status.model_copy(
        update={"pending_command_id": legacy_id}
    )

    offline = store.mark_offline("robot01")

    assert offline.last_command_id == legacy_id[:100]
    assert offline.last_command_action == LocalizationCommandAction.GLOBAL_LOCALIZATION


def test_provisional_verification_evidence_is_preserved():
    store = LocalizationStore()
    status, matched = store.apply(RobotLocalizationStatusMessage(
        type="localization_status",
        robot_id="robot01",
        health=LocalizationHealth.PROVISIONAL,
        reason=LocalizationReason.VERIFYING,
        amcl_state=AmclLifecycleState.ACTIVE,
        tf_available=True,
        moving=False,
        verification_command_id="localization-set_initial_pose:test",
        verification_sample_count=4,
        verification_elapsed_seconds=2.5,
        verification_tf_fresh=True,
    ))

    assert matched is False
    assert status.health == LocalizationHealth.PROVISIONAL
    assert status.verification_command_id == "localization-set_initial_pose:test"
    assert status.verification_sample_count == 4
    assert status.verification_tf_fresh is True
