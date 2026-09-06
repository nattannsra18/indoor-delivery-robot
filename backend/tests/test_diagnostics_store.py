from app.diagnostics_store import DiagnosticsStore
from app.models import DiagnosticStatusPayload


def status(
    name: str,
    *,
    hardware_id: str = "simulation",
    level: str = "OK",
) -> DiagnosticStatusPayload:
    return DiagnosticStatusPayload.model_validate(
        {
            "name": name,
            "level": level,
            "message": "Healthy",
            "hardware_id": hardware_id,
            "values": [],
        }
    )


def test_merges_diagnostics_from_independent_publishers() -> None:
    store = DiagnosticsStore()

    assert [
        item.name
        for item in store.update(
            "robot01",
            [status("LiDAR"), status("Odometry")],
        )
    ] == ["LiDAR", "Odometry"]

    merged = store.update(
        "robot01",
        [status("Nav2 Health", hardware_id="Nav2")],
    )

    assert [item.name for item in merged] == [
        "LiDAR",
        "Odometry",
        "Nav2 Health",
    ]


def test_replaces_a_matching_diagnostic_without_duplicates() -> None:
    store = DiagnosticsStore()
    store.update("robot01", [status("LiDAR")])

    merged = store.update(
        "robot01",
        [status("LiDAR", level="WARN")],
    )

    assert len(merged) == 1
    assert merged[0].level == "WARN"


def test_marks_old_diagnostics_stale_then_expires_them() -> None:
    now = 0.0
    store = DiagnosticsStore(
        clock=lambda: now,
        stale_after_seconds=5.0,
        expire_after_seconds=60.0,
    )
    store.update("robot01", [status("LiDAR")])

    now = 6.0
    stale = store.update("robot01", [])
    assert stale[0].level == "STALE"
    assert stale[0].message == "Diagnostic update is stale"

    now = 61.0
    assert store.update("robot01", []) == []
