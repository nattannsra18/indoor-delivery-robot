# Phase 2 — FastAPI Backend Guide

## Goal

Move the delivery business logic out of browser `localStorage` and into a real API service.

Phase 2 focuses on:

1. FastAPI server
2. REST API
3. Delivery validation
4. Task queue logic
5. Delivery state machine
6. Robot/station API models
7. CORS for the Next.js frontend

It intentionally does **not** include PostgreSQL or MQTT yet.

## Current split

```text
Phase 1.1 frontend
  └─ still uses React Context/localStorage for the interactive demo

Phase 2 backend
  └─ implements the same logic independently as REST API endpoints
```

The next step inside Phase 2 is to replace the frontend MockDeliveryContext actions with calls to this FastAPI service.

## Recommended test sequence in Swagger

1. Run FastAPI on port 8000.
2. Open `http://localhost:8000/docs`.
3. Call `GET /api/overview`.
4. Call `POST /api/tasks` with A → C.
5. Confirm the new task becomes `GOING_TO_PICKUP`.
6. Send `ARRIVED_PICKUP`.
7. Send `CONFIRM_LOADED`.
8. Send `ARRIVED_DESTINATION`.
9. Send `CONFIRM_RECEIVED`.
10. Call `GET /api/overview` and confirm the robot is `IDLE` and the task is `COMPLETED`.

## Why in-memory first?

Keeping Phase 2 in-memory makes it much easier to verify API structure and state transitions. Once the API behavior is stable, Phase 3 can replace the repository with PostgreSQL without redesigning the frontend workflow.
