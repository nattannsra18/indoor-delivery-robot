import { DeliveryTask, Robot, Station } from "@/types";

export const stations: Station[] = [
  { id: "A", name: "Station A", x: 1.2, y: 3.4, yaw: 0, description: "Main Office" },
  { id: "B", name: "Station B", x: 4.7, y: 1.8, yaw: 1.57, description: "Storage Area" },
  { id: "C", name: "Station C", x: 8.5, y: 2.1, yaw: 1.57, description: "Production Line" },
  { id: "D", name: "Station D", x: 6.3, y: 6.2, yaw: 3.14, description: "Quality Control" }
];

export const robots: Robot[] = [
  {
    id: "robot01",
    name: "SCUTTLE-01",
    online: true,
    battery: 82,
    state: "DELIVERING",
    x: 5.4,
    y: 2.7,
    yaw: 0.62,
    currentTaskId: "TASK-001",
    lastSeen: "Just now"
  }
];

export const tasks: DeliveryTask[] = [
  { id: "TASK-001", robotId: "robot01", pickupStationId: "A", destinationStationId: "C", status: "DELIVERING", createdAt: "10:32", progress: 68 },
  { id: "TASK-002", pickupStationId: "B", destinationStationId: "D", status: "QUEUED", createdAt: "10:38", progress: 0 },
  { id: "TASK-003", pickupStationId: "A", destinationStationId: "B", status: "QUEUED", createdAt: "10:42", progress: 0 },
  { id: "TASK-004", robotId: "robot01", pickupStationId: "D", destinationStationId: "A", status: "COMPLETED", createdAt: "09:55", progress: 100 }
];

export function stationName(id: string) {
  return stations.find((station) => station.id === id)?.name ?? id;
}
