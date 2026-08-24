# Phase 4 — Delivery Workflow / Task State Machine

Phase 4 builds on the Phase 3 stack:

```text
Next.js :3000
    |
    | REST API
    v
FastAPI :8000
    |
    +-- Task State Machine / Queue Logic
    |
    v
PostgreSQL :5432
```

The goal is to make delivery workflow logic safe enough that Phase 5 MQTT can send the same events without moving business logic into the robot or browser.

## Main workflow

```text
QUEUED
  |
  | automatic assignment
  v
GOING_TO_PICKUP
  |
  | ARRIVED_PICKUP
  v
WAITING_FOR_LOADING
  |
  | CONFIRM_LOADED
  v
DELIVERING
  |
  | ARRIVED_DESTINATION
  v
WAITING_FOR_UNLOADING
  |
  | CONFIRM_RECEIVED
  v
COMPLETED
```

Navigation can fail while the robot is moving:

```text
GOING_TO_PICKUP -- NAVIGATION_FAILED --> FAILED
DELIVERING      -- NAVIGATION_FAILED --> FAILED
```

A FAILED task can be retried. It returns to QUEUED and is assigned when the robot is available.

## What Phase 4 adds

- Centralized state machine in `backend/app/state_machine.py`
- Strict transition validation with HTTP 409 for invalid events
- Automatic FIFO queue dispatch
- Single-current-task enforcement for SCUTTLE-01
- Cancel active/queued task and re-dispatch the next job
- Navigation failure -> FAILED + robot ERROR
- Retry FAILED tasks
- Simulated robot OFFLINE / ONLINE behavior
- Robot recovery from ERROR
- Persistent `task_events` audit table in PostgreSQL
- Task history API and UI
- Event `source` field ready for `ROBOT_AGENT` in Phase 5

## Upgrade from Phase 3

Keep your existing PostgreSQL container and `backend/.env`.

Restart FastAPI using the Phase 4 code:

```cmd
cd backend
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Phase 4 does not change the existing `stations`, `robots`, or `delivery_tasks` columns. It adds one new table:

```text
task_events
```

FastAPI runs `Base.metadata.create_all()` on startup, so this new table is created automatically for this prototype.

Check:

```text
http://localhost:8000/health
```

Expected:

```json
{
  "status": "ok",
  "service": "indoor-delivery-backend",
  "phase": "4",
  "database": "connected",
  "workflow": "state-machine"
}
```

## Frontend

Open a second terminal at the project root:

```cmd
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Recommended Phase 4 test

1. Create Task A -> C.
2. Create Task B -> D while the first task is active.
3. Confirm the second task stays `QUEUED`.
4. Complete the first task.
5. Confirm the second task automatically becomes `GOING_TO_PICKUP`.
6. Create/activate another task and click `Simulate Navigation Failure`.
7. Confirm task becomes `FAILED` and robot becomes `ERROR`.
8. Use `Retry` on the failed task, or use `Recover Robot` to continue another queued task.
9. Open Task Queue -> `History` to inspect the event audit trail.
10. Test `Simulate Robot Offline`; an active task should fail safely and queued tasks should wait until the robot is online.

## Important API endpoints

```text
POST /api/tasks
POST /api/tasks/{task_id}/events
POST /api/tasks/{task_id}/cancel
POST /api/tasks/{task_id}/retry
GET  /api/tasks/{task_id}/history

POST /api/robots/{robot_id}/offline
POST /api/robots/{robot_id}/online
POST /api/robots/{robot_id}/recover
```

Example event payload:

```json
{
  "event": "ARRIVED_PICKUP",
  "source": "WEB_SIMULATOR"
}
```

Phase 5 will be able to use:

```json
{
  "event": "ARRIVED_PICKUP",
  "source": "ROBOT_AGENT"
}
```

The state machine itself does not need to change when MQTT is added.
