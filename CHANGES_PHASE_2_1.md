# Changes — Phase 2.1

## Frontend is now connected to FastAPI

Phase 1.1 used React Context + `localStorage` as the source of truth. Phase 2.1 replaces that with real HTTP requests to FastAPI.

### Added

- `src/lib/api.ts`
  - central REST API client
  - snake_case FastAPI response → camelCase frontend model mapping
  - readable API error handling
  - configurable `NEXT_PUBLIC_API_BASE_URL`

- `src/context/ApiDeliveryContext.tsx`
  - loads Stations, Tasks and Robot data from FastAPI
  - creates/cancels tasks through FastAPI
  - adds/deletes stations through FastAPI
  - sends delivery state-machine events to FastAPI
  - refreshes data every 2 seconds
  - exposes backend connection state to the UI

### Updated

- Dashboard reads FastAPI state
- Create Delivery calls `POST /api/tasks`
- Task Queue calls FastAPI and can cancel backend tasks
- Station Management calls FastAPI
- Robot Status shows backend integration status
- Workflow demo buttons send `POST /api/tasks/{task_id}/events`
- Sidebar shows FastAPI Connected / Backend Offline
- CORS already allows `localhost:3000` → `localhost:8000`

### Removed

- browser `localStorage` as delivery state storage
- `MockDeliveryContext.tsx`

## Still intentionally mocked / deferred

- occupancy-map drawing is still a UI visualization
- robot movement events are manually simulated from the web
- PostgreSQL is not added yet
- MQTT is not added yet
- ROS2 / Nav2 is not connected yet

These are later phases, so Phase 2.1 stays focused on validating the Frontend ↔ FastAPI integration.
