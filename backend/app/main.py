from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db_models  # noqa: F401 - registers SQLAlchemy tables
from .database import Base, SessionLocal, engine
from .routers import dashboard, health, robots, stations, tasks
from .seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as db:
        seed_database(db)
    yield


app = FastAPI(
    title="Indoor Delivery Robot API",
    version="0.3.0",
    description=(
        "Phase 3 FastAPI backend for the Indoor Autonomous Delivery Robot System. "
        "Stations, robot state and delivery tasks are persisted in PostgreSQL through SQLAlchemy."
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


@app.get("/")
def root():
    return {
        "name": "Indoor Delivery Robot API",
        "phase": "3",
        "storage": "PostgreSQL",
        "docs": "/docs",
        "health": "/health",
    }
