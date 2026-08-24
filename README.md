# Indoor Delivery Robot — Phase 1.1 Interactive Mock Workflow

Frontend prototype for the **Indoor Autonomous Delivery Robot System**.

## Stack
- Next.js
- React
- TypeScript
- Tailwind CSS
- React Context + browser localStorage
- Mock data only

## Pages
- `/` Dashboard
- `/delivery` Create Delivery
- `/tasks` Task Queue
- `/stations` Station Management
- `/robots` Robot Status

## Phase 1.1 workflow

The UI now shares state across every page and simulates the complete delivery state machine:

```text
Create Delivery
      ↓
GOING_TO_PICKUP
      ↓
WAITING_FOR_LOADING
      ↓
Physical CONFIRM (simulated)
      ↓
DELIVERING
      ↓
WAITING_FOR_UNLOADING
      ↓
Physical CONFIRM (simulated)
      ↓
COMPLETED
```

If the robot is already busy, newly created tasks remain `QUEUED`.

## What is new from Phase 1
- shared global mock state with React Context
- localStorage persistence across refreshes
- Create Delivery updates Dashboard and Task Queue
- automatic mock assignment when the robot is IDLE
- queued-task dispatch simulation
- full task-state simulation
- physical CONFIRM button simulation
- Station Management is shared with Create Delivery
- Robot Status updates with the workflow
- queued tasks can be cancelled
- reset demo button

## Run

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Suggested demo
1. Open **Create Delivery**.
2. Select pickup and destination.
3. Create a task.
4. Open **Dashboard**.
5. Click **Simulate arrival at Pickup**.
6. Click **Simulate physical CONFIRM — Package Loaded**.
7. Click **Simulate arrival at Destination**.
8. Click **Simulate physical CONFIRM — Package Received**.
9. Check **Task Queue** and confirm the task is `COMPLETED`.

## What is NOT connected yet
- FastAPI
- PostgreSQL
- MQTT / Mosquitto
- Robot Agent
- ROS2 / Nav2
- physical ESP32 button
- authentication

Those will replace the mock state in later phases.
