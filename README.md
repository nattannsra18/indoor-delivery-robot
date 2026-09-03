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

## One-command development stack

The launcher runs FastAPI, Next.js, Gazebo/Nav2/RViz2, and the ROS Web Bridge
in separate tmux windows while sharing one persistent robot token:

```bash
sudo apt install tmux
./scripts/run_dev_stack.sh
```

The ROS workspace defaults to the sibling directory
`../amr-navigation-vision-diagnostics`. Override it when needed:

```bash
AMR_ROS_WORKSPACE=/path/to/amr-navigation-vision-diagnostics \
  ./scripts/run_dev_stack.sh
```

Manage the stack without starting duplicate processes:

```bash
./scripts/run_dev_stack.sh status
./scripts/run_dev_stack.sh attach
./scripts/run_dev_stack.sh logs bridge
./scripts/run_dev_stack.sh restart
./scripts/run_dev_stack.sh stop
```

The launcher refuses to start when ports `3000` or `8000`, Gazebo/Nav2, or a
Web Bridge are already running outside its tmux session. `stop` sends Ctrl+C to
the four managed services before removing the session; it does not use broad
`pkill` patterns. The token is generated only when missing, stored in
`backend/.env`, and injected into FastAPI and the ROS Bridge without being
printed.

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

## Step 9 startup

Configure the Step 9 variables documented in `backend/.env.example`, then run:

```bash
docker compose up -d postgres
cd backend && source .venv/bin/activate
python3 -m uvicorn app.main:app --reload --port 8000
```

In another terminal:

```bash
cd ~/indoor-delivery-robot
npm run dev
```

Sign in at `http://localhost:3000/login`. Browser authentication uses only an
HttpOnly server session cookie; no token is stored in browser JavaScript.
