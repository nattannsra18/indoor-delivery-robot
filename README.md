# Indoor Autonomous Delivery Robot — Phase 4

Web system prototype for an indoor autonomous delivery robot based on the SCUTTLE platform.

## Current stack

```text
Next.js / React / TypeScript / Tailwind CSS
                 |
                 | REST API
                 v
             FastAPI
                 |
       +---------+----------+
       |                    |
Task State Machine      SQLAlchemy
       |                    |
       +---------+----------+
                 |
             PostgreSQL
```

MQTT and the real Robot Agent are intentionally not connected yet. They are planned for Phase 5 and Phase 6.

## Phase 4 features

- Dashboard
- Create Delivery
- Task Queue
- Station Management
- Robot Status
- PostgreSQL persistence
- Validated delivery task state machine
- FIFO task queue / automatic dispatch
- Physical CONFIRM event simulation
- Navigation failure simulation
- FAILED task retry
- Robot offline/online/recovery simulation
- Persistent task event history

## Run PostgreSQL

From project root:

```cmd
docker compose up -d postgres
docker compose ps
```

## Run FastAPI

```cmd
cd backend
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Swagger:

```text
http://localhost:8000/docs
```

## Run Next.js

Open another terminal at project root:

```cmd
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

See `PHASE_4_GUIDE.md` for the full workflow test.
