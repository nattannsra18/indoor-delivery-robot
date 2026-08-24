import { DeliveryTask, Robot, Station } from "@/types";

export const initialStations: Station[] = [
  { id: "A", name: "Station A", x: 1.2, y: 3.4, yaw: 0, description: "Main Office" },
  { id: "B", name: "Station B", x: 4.7, y: 1.8, yaw: 1.57, description: "Storage Area" },
  { id: "C", name: "Station C", x: 8.5, y: 2.1, yaw: 1.57, description: "Production Line" },
  { id: "D", name: "Station D", x: 6.3, y: 6.2, yaw: 3.14, description: "Quality Control" }
];

export const initialRobot: Robot = {
  id: "robot01",
  name: "SCUTTLE-01",
  online: true,
  battery: 92,
  state: "IDLE",
  x: 1.2,
  y: 3.4,
  yaw: 0,
  currentTaskId: undefined,
  lastSeen: "Just now"
};

export const initialTasks: DeliveryTask[] = [
  {
    id: "TASK-001",
    robotId: "robot01",
    pickupStationId: "D",
    destinationStationId: "A",
    status: "COMPLETED",
    createdAt: "09:55",
    progress: 100
  },
  {
    id: "TASK-002",
    robotId: "robot01",
    pickupStationId: "B",
    destinationStationId: "C",
    status: "COMPLETED",
    createdAt: "10:12",
    progress: 100
  }
];
