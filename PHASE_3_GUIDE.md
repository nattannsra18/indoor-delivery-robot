# Phase 3 — PostgreSQL

Phase 3 replaces the temporary in-memory FastAPI repository with a persistent PostgreSQL database.

## Architecture

```text
Next.js :3000
   │ REST
   ▼
FastAPI :8000
   │ SQLAlchemy
   ▼
PostgreSQL :5432
```

The frontend API contract is intentionally unchanged, so the Phase 2.1 Next.js pages continue to work without changing their request paths.

## Tables

### `stations`
- `id`
- `name`
- `x`
- `y`
- `yaw`
- `description`

### `robots`
- `id`
- `name`
- `online`
- `battery`
- `state`
- `x`, `y`, `yaw`
- `current_task_id`
- `last_seen`

### `delivery_tasks`
- `id`
- `robot_id`
- `pickup_station_id`
- `destination_station_id`
- `status`
- `created_at`
- `started_at`
- `completed_at`
- `progress`

`delivery_tasks.robot_id`, `pickup_station_id`, and `destination_station_id` use database foreign keys.

---

## Recommended Windows setup — Docker Desktop

### 1. Start PostgreSQL

From the project root:

```cmd
docker compose up -d postgres
```

Check it:

```cmd
docker compose ps
```

The included development credentials are:

```text
Database: indoor_delivery
User: postgres
Password: postgres
Host: localhost
Port: 5432
```

These credentials are only for local development.

### 2. Configure FastAPI

```cmd
cd backend
copy .env.example .env
```

The default `.env.example` contains:

```env
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/indoor_delivery
```

### 3. Install the new backend dependencies

If the virtual environment already exists:

```cmd
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

If it does not exist yet:

```cmd
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
```

### 4. Start FastAPI

```cmd
python -m uvicorn app.main:app --reload --port 8000
```

On first startup, SQLAlchemy creates the Phase 3 tables and inserts the initial demo stations, robot, and completed demo task if the database is empty.

Open:

```text
http://localhost:8000/docs
```

Check:

```text
GET /health
```

Expected result includes:

```json
{
  "status": "ok",
  "phase": "3",
  "database": "connected"
}
```

### 5. Start Next.js

Open another terminal at the project root:

```cmd
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

---

## Persistence test

1. Create a Delivery Task from the web.
2. Confirm that it appears in Task Queue.
3. Stop FastAPI with `Ctrl+C`.
4. Start FastAPI again.
5. Refresh the browser.

The task should still exist because it is now stored in PostgreSQL rather than Python memory.

You can also restart only the PostgreSQL container:

```cmd
docker compose restart postgres
```

The Docker named volume keeps the database data.

---

## Useful PostgreSQL commands

Open `psql` inside the container:

```cmd
docker exec -it indoor-delivery-postgres psql -U postgres -d indoor_delivery
```

Then:

```sql
\dt
SELECT * FROM stations;
SELECT id, status, pickup_station_id, destination_station_id FROM delivery_tasks ORDER BY created_at DESC;
SELECT * FROM robots;
```

Exit:

```text
\q
```

---

## Reset demo data

The existing prototype endpoint is still available:

```text
POST /api/demo/reset
```

It clears Phase 3 task/station/robot demo data and inserts the initial demo records again.

Do not expose this endpoint publicly in a production system.

---

## Run backend tests

The automated tests use an isolated SQLite database so they do not erase the development PostgreSQL database.

```cmd
cd backend
.venv\Scripts\activate
pytest -q
```

The runtime application still uses PostgreSQL via `DATABASE_URL`.

---

## Why SQLAlchemy?

FastAPI handles HTTP/API logic while SQLAlchemy handles persistence and database sessions. This separates the project into layers:

```text
Router
  ↓
Service / business logic
  ↓
Repository
  ↓
SQLAlchemy ORM
  ↓
PostgreSQL
```

This makes the later MQTT/ROS2 phase easier because robot communication does not need to contain database logic.

## Next phase

After Phase 3 is tested, the next major phase is Task State / workflow hardening and then MQTT communication. The current state machine already exists, so the most useful next improvement is usually adding MQTT while keeping PostgreSQL as the source of persistent task data.
