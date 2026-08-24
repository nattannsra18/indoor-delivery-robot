# FastAPI Backend — Phase 3

This backend persists the delivery robot prototype state in PostgreSQL.

## Layers

- `routers/` — HTTP endpoints
- `service.py` — task workflow/business rules
- `repository.py` — database queries
- `db_models.py` — SQLAlchemy ORM tables
- `models.py` — Pydantic API schemas/enums
- `database.py` — SQLAlchemy engine/session configuration
- `seed.py` — initial development data

## Install

```cmd
py -m venv .venv
.venv\Scripts\activate
python -m pip install -r requirements.txt
copy .env.example .env
```

Start PostgreSQL from the project root before starting FastAPI.

```cmd
docker compose up -d postgres
```

Run:

```cmd
python -m uvicorn app.main:app --reload --port 8000
```

Swagger:

```text
http://localhost:8000/docs
```
