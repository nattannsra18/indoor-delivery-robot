from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import db_models  # noqa: F401
from .database import Base, SessionLocal, engine
from .routers import (
    dashboard,
    dashboard_ws,
    health,
    maps,
    robot_ws,
    robots,
    stations,
    tasks,
)
from .seed import seed_database


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        seed_database(db)

    yield


app = FastAPI(
    title="Indoor Delivery Robot API",
    version="0.4.0",
    description=(
        "FastAPI backend for an indoor autonomous delivery "
        "robot. It provides a validated delivery workflow, "
        "PostgreSQL persistence, robot WebSocket transport, "
        "live telemetry and ROS occupancy-map integration."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
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
app.include_router(dashboard_ws.router)


@app.get("/")
def root():
    return {
        "name": "Indoor Delivery Robot API",
        "version": app.version,
        "storage": "PostgreSQL",
        "workflow": "validated task state machine",
        "robot_transport": "WebSocket",
        "robot_system": "ROS 2 and Nav2",
        "docs": "/docs",
        "health": "/health",
    }