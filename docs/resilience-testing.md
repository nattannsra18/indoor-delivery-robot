# Robot connection resilience

The control plane and Robot Agent use at-least-once delivery with stable command
identities. FastAPI persists the active navigation command before sending it,
and persists an accepted navigation result in the same transaction as the task
state transition. This lets either side retry a message without repeating the
workflow transition.

## Automated coverage

| Failure mode | Expected behavior | Automated coverage |
| --- | --- | --- |
| Robot Agent disconnects during an active mission | Keep the task assigned, raise an alert, and resend the same command after reconnect | `backend/tests/test_robot_registry.py::test_active_mission_survives_disconnect_alerts_and_resends_on_reconnect` |
| FastAPI restarts during an active mission | Restore the command from PostgreSQL and resend the original `command_id` | `backend/tests/test_navigation_path.py::test_navigation_command_identity_survives_control_plane_restart` |
| A navigation result is delivered more than once | Re-acknowledge the duplicate and apply exactly one task transition | `backend/tests/test_navigation_path.py::test_duplicate_navigation_result_replays_ack_without_transition` |
| A command arrives after its deadline | Reject it before it reaches Nav2 | `amr_web_bridge/test/test_emergency_stop.py::test_navigation_rejects_expired_foreign_and_incompatible_commands` |
| A command targets another robot or an incompatible profile/map revision | Reject it before it reaches Nav2 | `amr_web_bridge/test/test_emergency_stop.py::test_navigation_rejects_expired_foreign_and_incompatible_commands` |
| A repeated command is received on an existing Agent process | Acknowledge it without adding a second Nav2 goal | `amr_web_bridge/test/test_emergency_stop.py::test_navigation_command_id_is_idempotent_after_leaving_queue` |
| A robot goes offline while navigating | Preserve the active task for safe reconnect rather than dispatching it to another robot | `backend/tests/test_step12.py::test_robot_disconnect_preserves_active_task_for_safe_reconnect` |
| An administrator revokes a connected robot credential | Close the live socket immediately and reject future authentication | `backend/tests/test_robot_registry.py::test_admin_revoke_endpoint_closes_runtime_socket_immediately` |
| FastAPI receives repeated connection or notification events | Keep connection ownership identity-safe and deduplicate persisted notifications | `backend/tests/test_step14.py::test_reconnect_and_duplicate_delivery_do_not_create_duplicate_rows` |

## Run the suite

Backend:

```bash
cd backend
PYTHONPATH=. PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ./.venv/bin/python -m pytest -q
```

Robot Agent:

```bash
cd ~/amr-navigation-vision-diagnostics
source /opt/ros/jazzy/setup.bash
source install/setup.bash
colcon test --packages-select amr_web_bridge --event-handlers console_direct+
colcon test-result --verbose
```

## Delivery guarantee boundary

The current guarantee covers FastAPI restart, WebSocket reconnect, duplicate
messages, and credential revocation. A hard Robot Agent process or SBC power
loss while Nav2 is executing still requires physical-state reconciliation after
boot; it cannot be made exactly-once by WebSocket acknowledgements alone. The
Agent must stop motion on loss of its controller process, reconnect, receive the
stable command identity, and let the operator or recovery policy decide whether
to resume the interrupted physical mission.
