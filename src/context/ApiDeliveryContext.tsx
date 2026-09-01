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
import * as api from "@/lib/api";
import {
  DeliveryTask,
  OccupancyGridMap,
  Robot,
  Station,
  TaskStatus
} from "@/types";

const ACTIVE_STATUSES: TaskStatus[] = [
  "GOING_TO_PICKUP",
  "WAITING_FOR_LOADING",
  "DELIVERING",
  "WAITING_FOR_UNLOADING"
];

const EMPTY_ROBOT: Robot = {
  id: "robot01",
  name: "SCUTTLE-01",
  online: false,
  battery: 0,
  state: "OFFLINE",
  x: 0,
  y: 0,
  yaw: 0,
  lastSeen: "Backend unavailable"
};

type ApiDeliveryContextValue = {
  occupancyMap?: OccupancyGridMap;
  stations: Station[];
  tasks: DeliveryTask[];
  robot: Robot;
  activeTask?: DeliveryTask;
  queuedTasks: DeliveryTask[];
  failedTasks: DeliveryTask[];
  loading: boolean;
  backendOnline: boolean;
  error: string | null;
  createTask: (
    pickupStationId: string,
    destinationStationId: string
  ) => Promise<DeliveryTask>;
  addStation: (
    station: Omit<Station, "id">
  ) => Promise<Station>;
  removeStation: (
    stationId: string
  ) => Promise<{ ok: boolean; message: string }>;
  advanceRobotWorkflow: () => Promise<void>;
  cancelTask: (taskId: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  recoverRobot: () => Promise<void>;
  refreshAll: () => Promise<void>;
  stationName: (stationId: string) => string;
};

const ApiDeliveryContext =
  createContext<ApiDeliveryContextValue | null>(null);

export function ApiDeliveryProvider({
  children
}: {
  children: ReactNode;
}) {
  const [occupancyMap, setOccupancyMap] =
    useState<OccupancyGridMap | undefined>();
  const [stations, setStations] = useState<Station[]>([]);
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [robot, setRobot] = useState<Robot>(EMPTY_ROBOT);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshAll = useCallback(async () => {
    try {
      const [overview, stationData, taskData] = await Promise.all([
        api.getOverview(),
        api.getStations(),
        api.getTasks()
      ]);
      setRobot(overview.robot);
      setStations(stationData);
      setTasks(taskData);
      setBackendOnline(true);
      setError(null);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Unable to connect to FastAPI";
      setBackendOnline(false);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshMap = useCallback(async () => {
    try {
      setOccupancyMap(await api.getMap());
    } catch {
      setOccupancyMap(undefined);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
    const interval = window.setInterval(
      () => void refreshAll(),
      2000
    );
    return () => window.clearInterval(interval);
  }, [refreshAll]);

    useEffect(() => {
    let websocket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let stopped = false;

    const connect = () => {
      if (stopped) return;

      websocket = new WebSocket(
        `${api.WS_BASE_URL}/ws/dashboard`
      );

      websocket.onmessage = (event) => {
        try {
          const message = JSON.parse(
            event.data
          ) as {
            type?: string;
          };

          if (message.type === "workflow_updated") {
            void refreshAll();
          }
        } catch {
          // Ignore malformed WebSocket messages.
        }
      };

      websocket.onerror = () => {
        websocket?.close();
      };

      websocket.onclose = () => {
        websocket = null;

        if (!stopped) {
          reconnectTimer = window.setTimeout(
            connect,
            3000
          );
        }
      };
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }

      websocket?.close();
    };
  }, [refreshAll]);
  useEffect(() => {
    void refreshMap();
    const interval = window.setInterval(
      () => void refreshMap(),
      5000
    );
    return () => window.clearInterval(interval);
  }, [refreshMap]);

  const activeTask = useMemo(
    () =>
      tasks.find((task) =>
        ACTIVE_STATUSES.includes(task.status)
      ),
    [tasks]
  );

  const queuedTasks = useMemo(
    () => tasks.filter((task) => task.status === "QUEUED"),
    [tasks]
  );

  const failedTasks = useMemo(
    () => tasks.filter((task) => task.status === "FAILED"),
    [tasks]
  );

  const stationName = useCallback(
    (stationId: string) =>
      stations.find((station) => station.id === stationId)?.name ??
      stationId,
    [stations]
  );

  const runAndRefresh = useCallback(
    async (
      operation: () => Promise<unknown>,
      fallbackMessage: string
    ) => {
      try {
        await operation();
        await refreshAll();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : fallbackMessage;
        setError(message);
        throw err;
      }
    },
    [refreshAll]
  );

  const createTask = useCallback(
    async (
      pickupStationId: string,
      destinationStationId: string
    ) => {
      try {
        const created = await api.createTask(
          pickupStationId,
          destinationStationId
        );
        await refreshAll();
        return created;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to create task";
        setError(message);
        throw err;
      }
    },
    [refreshAll]
  );

  const addStation = useCallback(
    async (station: Omit<Station, "id">) => {
      try {
        const created = await api.addStation(station);
        await refreshAll();
        return created;
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to add station";
        setError(message);
        throw err;
      }
    },
    [refreshAll]
  );

  const removeStation = useCallback(
    async (stationId: string) => {
      try {
        await api.deleteStation(stationId);
        await refreshAll();
        return {
          ok: true,
          message: `${stationName(stationId)} removed from FastAPI.`
        };
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to remove station";
        setError(message);
        return { ok: false, message };
      }
    },
    [refreshAll, stationName]
  );

  const advanceRobotWorkflow = useCallback(async () => {
    if (!activeTask) return;

    const eventByStatus: Partial<
      Record<TaskStatus, api.TaskEvent>
    > = {
      WAITING_FOR_LOADING: "CONFIRM_LOADED",
      WAITING_FOR_UNLOADING: "CONFIRM_RECEIVED"
    };
    const event = eventByStatus[activeTask.status];
    if (!event) return;

    await runAndRefresh(
      () => api.applyTaskEvent(activeTask.id, event),
      "Unable to advance workflow"
    );
  }, [activeTask, runAndRefresh]);

  const cancelTask = useCallback(
    async (taskId: string) => {
      await runAndRefresh(
        () => api.cancelTask(taskId),
        "Unable to cancel task"
      );
    },
    [runAndRefresh]
  );

  const retryTask = useCallback(
    async (taskId: string) => {
      await runAndRefresh(
        () => api.retryTask(taskId),
        "Unable to retry task"
      );
    },
    [runAndRefresh]
  );

  const recoverRobot = useCallback(async () => {
    await runAndRefresh(
      () => api.recoverRobot(robot.id),
      "Unable to recover robot"
    );
  }, [robot.id, runAndRefresh]);

  const value = useMemo<ApiDeliveryContextValue>(
    () => ({
      occupancyMap,
      stations,
      tasks,
      robot,
      activeTask,
      queuedTasks,
      failedTasks,
      loading,
      backendOnline,
      error,
      createTask,
      addStation,
      removeStation,
      advanceRobotWorkflow,
      cancelTask,
      retryTask,
      recoverRobot,
      refreshAll,
      stationName
    }),
    [
      occupancyMap,
      stations,
      tasks,
      robot,
      activeTask,
      queuedTasks,
      failedTasks,
      loading,
      backendOnline,
      error,
      createTask,
      addStation,
      removeStation,
      advanceRobotWorkflow,
      cancelTask,
      retryTask,
      recoverRobot,
      refreshAll,
      stationName
    ]
  );

  return (
    <ApiDeliveryContext.Provider value={value}>
      {children}
    </ApiDeliveryContext.Provider>
  );
}

export function useDeliveryApi() {
  const context = useContext(ApiDeliveryContext);
  if (!context) {
    throw new Error(
      "useDeliveryApi must be used inside ApiDeliveryProvider"
    );
  }
  return context;
}