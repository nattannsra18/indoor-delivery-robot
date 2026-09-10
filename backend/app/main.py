from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from . import db_models  # noqa: F401
from .database import Base, SessionLocal, engine
from .routers import (
    dashboard,
    dashboard_ws,
    auth,
    alerts,
    emergency,
    health,
    maps,
    mapping,
    localization,
    robot_ws,
    robot_registry,
    robots,
    stations,
    tasks,
    notifications,
    audit,
)
from .seed import seed_database
from .auth import bootstrap_admin
from .config import security_settings
from .schema import apply_compatibility_migrations
from .service import DeliveryService


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    apply_compatibility_migrations(engine)

    with SessionLocal() as db:
        seed_database(db, app_env=security_settings().app_env)
        bootstrap_admin(db)
        DeliveryService(db).clear_stale_paired_connections()

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

settings = security_settings()
allowed_origins = set(settings.cors_allowed_origins)
if settings.app_env != "production":
    allowed_origins.update({
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    })

app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=list(settings.trusted_hosts),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(emergency.router)
app.include_router(dashboard.router)
app.include_router(stations.router)
app.include_router(robots.router)
app.include_router(tasks.router)
app.include_router(notifications.router)
app.include_router(audit.router)
app.include_router(maps.router)
app.include_router(mapping.router)
app.include_router(localization.router)
app.include_router(robot_ws.router)
app.include_router(robot_registry.router)
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
