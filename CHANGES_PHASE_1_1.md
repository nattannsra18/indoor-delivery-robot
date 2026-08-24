# Phase 1.1 changes

This update connects the mock UI into one shared workflow before adding the real backend.

## Added
- React Context global mock state
- localStorage persistence
- end-to-end delivery state machine
- automatic mock assignment while robot is IDLE
- queued task dispatch simulation
- simulated Nav2 arrival events
- simulated physical CONFIRM button for loading/unloading
- shared Station Management data
- dynamic Robot Status
- queued task cancellation
- demo reset control

## Workflow

`QUEUED → GOING_TO_PICKUP → WAITING_FOR_LOADING → DELIVERING → WAITING_FOR_UNLOADING → COMPLETED`

## Important

The workflow buttons are temporary Phase 1.1 simulation controls. Later:
- Nav2 will generate arrival events.
- ESP32 will generate physical CONFIRM button events.
- MQTT will carry robot/task messages.
- FastAPI + PostgreSQL will replace local mock state.
