# FastAPI Backend — Step 9

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

## Step 9 security and safety configuration

Copy `.env.example` to `.env` and replace every placeholder. The bootstrap
administrator is created only when no enabled ADMIN exists; restarts never
overwrite an existing password or role. Passwords use salted PBKDF2-HMAC-SHA256.
Browser sessions are opaque HttpOnly `SameSite=Lax` cookies, while PostgreSQL
stores only their SHA-256 token digest. Set `SESSION_COOKIE_SECURE=true` behind
HTTPS. Production refuses to start without `ROBOT_WS_TOKEN`.

Roles are `ADMIN` and `USER`. ADMIN can manage all tasks, stations, alerts,
robot controls, and Emergency Stop. USER can create and operate only owned
tasks. Ownerless legacy tasks remain ADMIN-only. This implementation permits
only ADMIN to activate or reset the software Emergency Stop.

Alerts persist and deduplicate diagnostics, robot disconnects, Nav2 failures,
task failures, and Emergency Stop failures. ADMIN may acknowledge or resolve
them through `/api/alerts` and receives live changes over `/ws/dashboard`.

> THIS SOFTWARE EMERGENCY STOP IS NOT A SUBSTITUTE FOR A CERTIFIED PHYSICAL
> EMERGENCY STOP CIRCUIT.

The stop is latched in PostgreSQL and in the ROS bridge, cancels the active
task/Nav2 goal, clears the path, blocks new movement, and continuously publishes
zero velocity. Reset is ADMIN-only, clears only after a correlated bridge ACK,
and never resumes old work.
