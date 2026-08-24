# FastAPI Backend — Phase 4

Backend for the Indoor Autonomous Delivery Robot System.

Phase 4 uses PostgreSQL + SQLAlchemy and adds the validated Delivery Task State Machine.

## Run

```cmd
.venv\Scripts\activate
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

Swagger:

```text
http://localhost:8000/docs
```

Health:

```text
http://localhost:8000/health
```

## Test

```cmd
python -m pytest -q
```

Phase 4 test suite covers state transitions, invalid events, FIFO queue dispatch, cancellation, navigation failure, retry, robot offline/online, robot recovery and database persistence.
