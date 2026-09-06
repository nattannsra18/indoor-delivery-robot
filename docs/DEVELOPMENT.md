# Development Guide

This guide covers local configuration, service topology, verification, and common operational checks for the Indoor Delivery Robot web platform.

## Workspace layout

The development stack expects the web and ROS repositories to share the same parent directory:

```text
workspace/
├── indoor-delivery-robot/
└── amr-navigation-vision-diagnostics/
```

The ROS repository provides the Gazebo world, Nav2 configuration, SLAM and localization services, and `amr_web_bridge`. The web repository provides the Next.js portal, FastAPI service, and PostgreSQL persistence.

## Environment files

```bash
cp .env.local.example .env.local
cp backend/.env.example backend/.env
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | SQLAlchemy connection string for PostgreSQL. |
| `BOOTSTRAP_ADMIN_USERNAME` | Initial administrator username. |
| `BOOTSTRAP_ADMIN_PASSWORD` | Initial administrator password; replace the example value. |
| `SESSION_COOKIE_SECURE` | Use `true` behind HTTPS in production. |
| `ROBOT_WS_AUTH_REQUIRED` | Requires Robot Agent authentication when enabled. |
| `ROBOT_WS_TOKEN` | Shared token used by the backend. |
| `AMR_WEB_BRIDGE_TOKEN` | Matching shared token used by the Robot Agent. |
| `FRONTEND_URL` | Allowed web origin and password-reset base URL. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional Google sign-in credentials. |
| `SMTP_*` | Optional email transport for password reset and account approval. |

Do not commit local environment files, access tokens, passwords, or SMTP credentials.

## Install dependencies

```bash
npm ci
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
docker compose up -d postgres
```

Build the Robot Agent from the companion workspace:

```bash
cd ../amr-navigation-vision-diagnostics
source /opt/ros/jazzy/setup.bash
colcon build --packages-select amr_web_bridge --symlink-install
```

## Run the complete stack

```bash
./scripts/run_dev_stack.sh
./scripts/run_dev_stack.sh status
```

Useful commands:

```bash
./scripts/run_dev_stack.sh attach
./scripts/run_dev_stack.sh logs
./scripts/run_dev_stack.sh stop
```

| Service | Address |
| --- | --- |
| Next.js portal | `http://localhost:3000` |
| FastAPI API | `http://localhost:8000` |
| FastAPI health | `http://localhost:8000/health` |
| PostgreSQL | `localhost:5432` |

## Run services individually

Frontend:

```bash
npm run dev
```

Backend:

```bash
cd backend
PYTHONPATH=. ./.venv/bin/python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The Robot Agent must still be running for live ROS maps, telemetry, navigation planning, mapping, localization, and mission execution.

## Verification

```bash
npm test
npm run typecheck
npm run lint
```

Or run every frontend check together:

```bash
npm run check
```

Backend tests:

```bash
cd backend
PYTHONPATH=. PYTEST_DISABLE_PLUGIN_AUTOLOAD=1 ./.venv/bin/python -m pytest -q
```

## Acceptance workflow

1. Submit a new account request.
2. Sign in as an administrator and approve the request.
3. Sign in as the approved user.
4. Select pickup and destination stations and confirm a valid Nav2 preview.
5. Create the delivery and verify queue estimates.
6. Observe navigation to pickup and confirm package loading.
7. Observe navigation to destination and confirm package receipt.
8. Verify completion in delivery history, notifications, and the admin audit log.

Mapping and localization should be tested separately while the robot is idle and no delivery is active or queued.

## Operational notes

- Map files remain robot-side; the web application requests inventory and changes through the Robot Agent.
- During SLAM, Nav2 localization is paused and restored after the map is saved or the capture is discarded.
- Teleoperation uses a dead-man timeout. Releasing a control or losing command updates stops the robot.
- Global relocalization may rotate or move the robot during an assisted scan; keep the simulated or physical area clear.
- The software emergency stop is not a substitute for certified physical safety hardware.
