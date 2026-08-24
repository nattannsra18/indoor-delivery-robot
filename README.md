# Indoor Autonomous Delivery Robot — Phase 3

Phase 3 connects the existing Next.js + FastAPI application to PostgreSQL so robot, station, and delivery-task data survive backend restarts.

## Stack

- Frontend: Next.js / React / TypeScript / Tailwind CSS
- Backend: FastAPI / Pydantic / Uvicorn
- ORM: SQLAlchemy 2
- Database: PostgreSQL
- PostgreSQL driver: Psycopg 3
- Frontend updates: REST + 2-second polling

## Current architecture

```text
Next.js
   │ REST
   ▼
FastAPI
   │
   ├── Service / Task State Machine
   │       │
   │       ▼
   │   Repository
   │       │
   │       ▼
   └── SQLAlchemy ──► PostgreSQL
```

## Quick start on Windows

### Terminal 1 — PostgreSQL

From project root:

```cmd
docker compose up -d postgres
```

### Terminal 2 — FastAPI

```cmd
cd backend
copy .env.example .env
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

### Terminal 3 — Next.js

```cmd
npm install
npm run dev
```

Open:

- Frontend: `http://localhost:3000`
- Swagger: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

See `PHASE_3_GUIDE.md` for setup, persistence testing, and PostgreSQL inspection commands.
