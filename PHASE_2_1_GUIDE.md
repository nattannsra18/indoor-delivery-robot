# Phase 2.1 — Next.js ↔ FastAPI

This version removes browser `localStorage` as the source of truth for delivery data.
The Next.js UI now reads and writes the FastAPI backend over REST.

## Architecture

```text
Browser / Next.js :3000
        |
        | REST (fetch)
        v
FastAPI :8000
        |
        +-- in-memory Stations
        +-- in-memory Tasks
        +-- in-memory Robot state
```

PostgreSQL and MQTT are intentionally not added yet.

## Data flow

- Dashboard: `GET /api/overview`, `GET /api/tasks`, `GET /api/stations`
- Create Delivery: `POST /api/tasks`
- Station Management: `GET/POST/DELETE /api/stations`
- Task Queue: `GET /api/tasks`, `POST /api/tasks/{id}/cancel`
- Workflow simulation: `POST /api/tasks/{id}/events`
- Reset demo: `POST /api/demo/reset`

The frontend also refreshes backend data every 2 seconds. WebSocket is planned later for real-time browser updates.

## Run backend

Open terminal 1:

```cmd
cd backend
.venv\Scripts\activate
python -m uvicorn app.main:app --reload --port 8000
```

Swagger:

```text
http://localhost:8000/docs
```

## Run frontend

Open terminal 2 from the project root:

```cmd
npm install
npm run dev
```

Frontend:

```text
http://localhost:3000
```

## Optional environment file

Copy `.env.local.example` to `.env.local` if you want to explicitly configure the backend URL:

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## Test the connection

1. Keep FastAPI running on port 8000.
2. Keep Next.js running on port 3000.
3. Sidebar should show `FastAPI Connected`.
4. Open Create Delivery and create Station A → Station C.
5. The task should appear immediately in Dashboard and Task Queue.
6. Use the Phase 2.1 API Control buttons to advance the workflow.
7. Watch Swagger or `GET /api/tasks` to confirm that the state is really stored in FastAPI.

## Important limitation

The backend still stores data in RAM. Restarting FastAPI resets the current state. Persistent storage is Phase 3 with PostgreSQL.
