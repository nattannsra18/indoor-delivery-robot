"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import { initialRobot, initialStations, initialTasks } from "@/lib/mock-data";
import { DeliveryTask, Robot, Station, TaskStatus } from "@/types";

type MockDeliveryContextValue = {
  stations: Station[];
  tasks: DeliveryTask[];
  robot: Robot;
  activeTask?: DeliveryTask;
  queuedTasks: DeliveryTask[];
  createTask: (pickupStationId: string, destinationStationId: string) => DeliveryTask;
  addStation: (station: Omit<Station, "id">) => Station;
  removeStation: (stationId: string) => { ok: boolean; message: string };
  startNextTask: () => void;
  advanceRobotWorkflow: () => void;
  cancelTask: (taskId: string) => void;
  resetDemo: () => void;
  stationName: (stationId: string) => string;
};

const STORAGE_KEY = "indoor-delivery-phase1-1-state";

const MockDeliveryContext = createContext<MockDeliveryContextValue | null>(null);

function isActiveStatus(status: TaskStatus) {
  return [
    "GOING_TO_PICKUP",
    "WAITING_FOR_LOADING",
    "DELIVERING",
    "WAITING_FOR_UNLOADING"
  ].includes(status);
}

function progressFor(status: TaskStatus) {
  const values: Record<TaskStatus, number> = {
    QUEUED: 0,
    GOING_TO_PICKUP: 20,
    WAITING_FOR_LOADING: 35,
    DELIVERING: 70,
    WAITING_FOR_UNLOADING: 90,
    COMPLETED: 100,
    FAILED: 0,
    CANCELLED: 0
  };
  return values[status];
}

function nextTaskNumber(tasks: DeliveryTask[]) {
  const max = tasks.reduce((highest, task) => {
    const match = task.id.match(/TASK-(\d+)/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return max + 1;
}

export function MockDeliveryProvider({ children }: { children: ReactNode }) {
  const [stations, setStations] = useState<Station[]>(initialStations);
  const [tasks, setTasks] = useState<DeliveryTask[]>(initialTasks);
  const [robot, setRobot] = useState<Robot>(initialRobot);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          stations?: Station[];
          tasks?: DeliveryTask[];
          robot?: Robot;
        };
        if (parsed.stations?.length) setStations(parsed.stations);
        if (parsed.tasks) setTasks(parsed.tasks);
        if (parsed.robot) setRobot(parsed.robot);
      }
    } catch {
      // Ignore invalid local mock data and use defaults.
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ stations, tasks, robot })
    );
  }, [hydrated, stations, tasks, robot]);

  const activeTask = useMemo(
    () => tasks.find((task) => isActiveStatus(task.status)),
    [tasks]
  );

  const queuedTasks = useMemo(
    () => tasks.filter((task) => task.status === "QUEUED"),
    [tasks]
  );

  const stationName = useCallback(
    (stationId: string) =>
      stations.find((station) => station.id === stationId)?.name ?? stationId,
    [stations]
  );

  const createTask = useCallback(
    (pickupStationId: string, destinationStationId: string) => {
      const number = nextTaskNumber(tasks);
      const task: DeliveryTask = {
        id: `TASK-${String(number).padStart(3, "0")}`,
        pickupStationId,
        destinationStationId,
        status: "QUEUED",
        createdAt: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),
        progress: 0
      };

      const hasActiveTask = tasks.some((item) => isActiveStatus(item.status));
      const shouldAutoAssign = !hasActiveTask && robot.state === "IDLE";
      const created = shouldAutoAssign
        ? { ...task, robotId: robot.id, status: "GOING_TO_PICKUP" as const, progress: 20 }
        : task;

      setTasks((current) => [created, ...current]);

      if (shouldAutoAssign) {
        setRobot((current) => ({
          ...current,
          state: "GOING_TO_PICKUP",
          currentTaskId: created.id,
          lastSeen: "Just now"
        }));
      }

      return created;
    },
    [robot.id, robot.state, tasks]
  );

  const addStation = useCallback(
    (station: Omit<Station, "id">) => {
      const numericIds = stations
        .map((item) => item.id.match(/^S(\d+)$/)?.[1])
        .filter(Boolean)
        .map(Number);
      const next = (numericIds.length ? Math.max(...numericIds) : 0) + 1;
      const created = { ...station, id: `S${next}` };
      setStations((current) => [...current, created]);
      return created;
    },
    [stations]
  );

  const removeStation = useCallback(
    (stationId: string) => {
      const inUse = tasks.some(
        (task) =>
          task.pickupStationId === stationId || task.destinationStationId === stationId
      );

      if (inUse) {
        return {
          ok: false,
          message: `${stationName(stationId)} is referenced by a task and cannot be removed in this demo.`
        };
      }

      setStations((current) => current.filter((station) => station.id !== stationId));
      return { ok: true, message: `${stationName(stationId)} removed.` };
    },
    [stationName, tasks]
  );

  const startNextTask = useCallback(() => {
    if (activeTask || robot.state !== "IDLE") return;

    const next = [...queuedTasks].reverse()[0];
    if (!next) return;

    setTasks((current) =>
      current.map((task) =>
        task.id === next.id
          ? {
              ...task,
              robotId: robot.id,
              status: "GOING_TO_PICKUP",
              progress: progressFor("GOING_TO_PICKUP")
            }
          : task
      )
    );

    setRobot((current) => ({
      ...current,
      state: "GOING_TO_PICKUP",
      currentTaskId: next.id,
      lastSeen: "Just now"
    }));
  }, [activeTask, queuedTasks, robot.id, robot.state]);

  const advanceRobotWorkflow = useCallback(() => {
    if (!activeTask) return;

    const transitions: Partial<Record<TaskStatus, TaskStatus>> = {
      GOING_TO_PICKUP: "WAITING_FOR_LOADING",
      WAITING_FOR_LOADING: "DELIVERING",
      DELIVERING: "WAITING_FOR_UNLOADING",
      WAITING_FOR_UNLOADING: "COMPLETED"
    };

    const nextStatus = transitions[activeTask.status];
    if (!nextStatus) return;

    setTasks((current) =>
      current.map((task) =>
        task.id === activeTask.id
          ? {
              ...task,
              status: nextStatus,
              progress: progressFor(nextStatus)
            }
          : task
      )
    );

    if (nextStatus === "COMPLETED") {
      const destination = stations.find(
        (station) => station.id === activeTask.destinationStationId
      );
      setRobot((current) => ({
        ...current,
        state: "IDLE",
        currentTaskId: undefined,
        x: destination?.x ?? current.x,
        y: destination?.y ?? current.y,
        yaw: destination?.yaw ?? current.yaw,
        lastSeen: "Just now"
      }));
      return;
    }

    const robotState = nextStatus as Robot["state"];
    const targetStationId =
      nextStatus === "WAITING_FOR_LOADING"
        ? activeTask.pickupStationId
        : nextStatus === "WAITING_FOR_UNLOADING"
          ? activeTask.destinationStationId
          : undefined;
    const target = targetStationId
      ? stations.find((station) => station.id === targetStationId)
      : undefined;

    setRobot((current) => ({
      ...current,
      state: robotState,
      x: target?.x ?? current.x,
      y: target?.y ?? current.y,
      yaw: target?.yaw ?? current.yaw,
      lastSeen: "Just now"
    }));
  }, [activeTask, stations]);

  const cancelTask = useCallback(
    (taskId: string) => {
      const target = tasks.find((task) => task.id === taskId);
      if (!target || target.status !== "QUEUED") return;

      setTasks((current) =>
        current.map((task) =>
          task.id === taskId ? { ...task, status: "CANCELLED", progress: 0 } : task
        )
      );
    },
    [tasks]
  );

  const resetDemo = useCallback(() => {
    setStations(initialStations);
    setTasks(initialTasks);
    setRobot(initialRobot);
    window.localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<MockDeliveryContextValue>(
    () => ({
      stations,
      tasks,
      robot,
      activeTask,
      queuedTasks,
      createTask,
      addStation,
      removeStation,
      startNextTask,
      advanceRobotWorkflow,
      cancelTask,
      resetDemo,
      stationName
    }),
    [
      stations,
      tasks,
      robot,
      activeTask,
      queuedTasks,
      createTask,
      addStation,
      removeStation,
      startNextTask,
      advanceRobotWorkflow,
      cancelTask,
      resetDemo,
      stationName
    ]
  );

  return (
    <MockDeliveryContext.Provider value={value}>
      {children}
    </MockDeliveryContext.Provider>
  );
}

export function useMockDelivery() {
  const context = useContext(MockDeliveryContext);
  if (!context) {
    throw new Error("useMockDelivery must be used inside MockDeliveryProvider");
  }
  return context;
}
