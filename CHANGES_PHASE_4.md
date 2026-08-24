# Changes — Phase 4

## Backend

- Added `backend/app/state_machine.py`.
- Added validated state transitions.
- Added `NAVIGATION_FAILED` event.
- Added retry endpoint for FAILED tasks.
- Expanded cancellation to all non-terminal workflow states.
- Added robot offline/online/recovery endpoints.
- Improved automatic FIFO queue dispatch.
- Added row-lock-ready repository methods using `SELECT ... FOR UPDATE`.
- Added persistent `task_events` table.
- Added task event history endpoint.
- Added event source metadata (`WEB_SIMULATOR`, `ROBOT_AGENT`, `SYSTEM`).
- Health endpoint now reports Phase 4.
- Expanded backend tests to cover workflow, queue, invalid events, failure, retry, offline and recovery.

## Frontend

- Workflow controls now identify Phase 4.
- Added Navigation Failure simulator.
- Added Robot Offline / Online simulator.
- Added Robot Recovery action.
- Task Queue now supports FAILED filter.
- FAILED tasks can be retried.
- Active and queued tasks can be cancelled according to backend rules.
- Added Task History viewer backed by PostgreSQL.
- Updated Phase labels and integration status.

## Database

New table:

```text
task_events
```

No destructive schema change is required for the existing Phase 3 tables.
