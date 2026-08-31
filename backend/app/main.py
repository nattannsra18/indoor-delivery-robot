from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db_models  # noqa: F401 - registers SQLAlchemy tables
from .database import Base, SessionLocal, engine
from .routers import (
    dashboard,
    health,
    maps,
    robot_ws,
    robots,
    stations,
    tasks,
)
from .seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Phase 4 adds task_events as a new table. Existing Phase 3 tables remain compatible.
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    yield


app = FastAPI(
    title="Indoor Delivery Robot API",
    version="0.4.0",
    description=(
        "Phase 4 FastAPI backend for the Indoor Autonomous Delivery Robot System. "
        "Adds a validated delivery task state machine, automatic queue dispatch, failure/retry logic, "
        "robot offline/recovery handling and persistent task event history."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(dashboard.router)
app.include_router(stations.router)
app.include_router(robots.router)
app.include_router(tasks.router)
app.include_router(maps.router)
app.include_router(robot_ws.router)

@app.get("/")
def root():
    return {
        "name": "Indoor Delivery Robot API",
        "phase": "4",
        "storage": "PostgreSQL",
        "workflow": "validated state machine",
        "docs": "/docs",
        "health": "/health",
    }
