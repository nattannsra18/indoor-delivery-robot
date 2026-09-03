"use client";

import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import * as api from "@/lib/api";
import {
  framesAreCompatible,
  parseNavigationPath,
  parseNavigationPathClear
} from "@/lib/navigationPath";
import {
  DeliveryTask,
  DiagnosticLevel,
  DiagnosticStatus,
  NavigationFeedback,
  NavigationPath,
  NavigationPathStatus,
  OccupancyGridMap,
  Robot,
  RobotDiagnostics,
  Station,
  TaskStatus
} from "@/types";

const ACTIVE_STATUSES: TaskStatus[] = [
  "GOING_TO_PICKUP",
  "WAITING_FOR_LOADING",
  "DELIVERING",
  "WAITING_FOR_UNLOADING"
];

const DIAGNOSTIC_LEVELS: DiagnosticLevel[] = [
  "OK",
  "WARN",
  "ERROR",
  "STALE"
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

type NavigationFeedbackMessage = {
  type: "navigation_feedback";
  robot_id: string;
  command_id: string;
  task_id: string;
  stage: "pickup" | "destination";
  distance_remaining: number;
  navigation_time_seconds: number;
  estimated_time_remaining_seconds: number | null;
  number_of_recoveries: number;
  linear_velocity: number | null;
  angular_velocity: number | null;
  current_pose: {
    frame_id: string;
    x: number;
    y: number;
    yaw: number;
  };
  timestamp: string | null;
  server_time: string;
};

type ApiDeliveryContextValue = {
  occupancyMap?: OccupancyGridMap;
  navigationFeedback?: NavigationFeedback;
  navigationPath?: NavigationPath;
  navigationPathStatus: NavigationPathStatus;
  diagnostics?: RobotDiagnostics;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
  );
}

function isDiagnosticLevel(
  value: unknown
): value is DiagnosticLevel {
  return (
    typeof value === "string"
    && DIAGNOSTIC_LEVELS.includes(
      value as DiagnosticLevel
    )
  );
}

function parseRobotDiagnostics(
  value: unknown
): RobotDiagnostics | undefined {
  if (
    !isRecord(value)
    || value.type !== "robot_diagnostics"
    || typeof value.robot_id !== "string"
    || !value.robot_id
    || !isDiagnosticLevel(value.overall_level)
    || !Array.isArray(value.statuses)
    || typeof value.server_time !== "string"
    || !Number.isFinite(Date.parse(value.server_time))
    || !(
      value.timestamp === null
      || typeof value.timestamp === "string"
    )
    || (
      typeof value.timestamp === "string"
      && !Number.isFinite(Date.parse(value.timestamp))
    )
  ) {
    return undefined;
  }

  const statuses: DiagnosticStatus[] = [];

  for (const rawStatus of value.statuses) {
    if (
      !isRecord(rawStatus)
      || typeof rawStatus.name !== "string"
      || !rawStatus.name
      || !isDiagnosticLevel(rawStatus.level)
      || typeof rawStatus.message !== "string"
      || typeof rawStatus.hardware_id !== "string"
      || !Array.isArray(rawStatus.values)
    ) {
      return undefined;
    }

    const values = [];

    for (const rawValue of rawStatus.values) {
      if (
        !isRecord(rawValue)
        || typeof rawValue.key !== "string"
        || !rawValue.key
        || typeof rawValue.value !== "string"
      ) {
        return undefined;
      }

      values.push({
        key: rawValue.key,
        value: rawValue.value
      });
    }

    statuses.push({
      name: rawStatus.name,
      level: rawStatus.level,
      message: rawStatus.message,
      hardwareId: rawStatus.hardware_id,
      values
    });
  }

  return {
    robotId: value.robot_id,
    overallLevel: value.overall_level,
    statuses,
    timestamp:
      typeof value.timestamp === "string"
        ? value.timestamp
        : undefined,
    serverTime: value.server_time
  };
}

function expectedNavigationStage(
  task: DeliveryTask | undefined
): "pickup" | "destination" | undefined {
  if (task?.status === "GOING_TO_PICKUP") {
    return "pickup";
  }
  if (task?.status === "DELIVERING") {
    return "destination";
  }
  return undefined;
}

export function ApiDeliveryProvider({
  children
}: {
  children: ReactNode;
}) {
  const [occupancyMap, setOccupancyMap] =
    useState<OccupancyGridMap | undefined>();
  const [
    navigationFeedback,
    setNavigationFeedback
  ] = useState<NavigationFeedback | undefined>();
  const [navigationPath, setNavigationPath] =
    useState<NavigationPath | undefined>();
  const [
    navigationPathStatus,
    setNavigationPathStatus
  ] = useState<NavigationPathStatus>("unavailable");
  const [diagnostics, setDiagnostics] =
    useState<RobotDiagnostics | undefined>();
  const [stations, setStations] = useState<Station[]>([]);
  const [tasks, setTasks] = useState<DeliveryTask[]>([]);
  const [robot, setRobot] = useState<Robot>(EMPTY_ROBOT);
  const [loading, setLoading] = useState(true);
  const [backendOnline, setBackendOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigationPathRef = useRef<NavigationPath | undefined>(
    undefined
  );
  const pendingNavigationPathRef = useRef<NavigationPath | undefined>(
    undefined
  );
  const occupancyMapRef = useRef<OccupancyGridMap | undefined>(
    undefined
  );
  const robotRef = useRef<Robot>(EMPTY_ROBOT);
  const activeTaskRef = useRef<DeliveryTask | undefined>(undefined);

  const activeTask = useMemo(
    () =>
      tasks.find((task) =>
        ACTIVE_STATUSES.includes(task.status)
      ),
    [tasks]
  );

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
      setDiagnostics(undefined);
      navigationPathRef.current = undefined;
      pendingNavigationPathRef.current = undefined;
      setNavigationPath(undefined);
      setNavigationPathStatus("unavailable");
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    occupancyMapRef.current = occupancyMap;
    const currentPath = navigationPathRef.current;
    if (
      occupancyMap
      && currentPath
      && !framesAreCompatible(
        occupancyMap.frameId,
        currentPath.frameId
      )
    ) {
      navigationPathRef.current = undefined;
      setNavigationPath(undefined);
      setNavigationPathStatus("unavailable");
    }
  }, [occupancyMap]);

  useEffect(() => {
    robotRef.current = robot;
  }, [robot]);

  useEffect(() => {
    const previous = activeTaskRef.current;
    const previousStage = expectedNavigationStage(previous);
    const nextStage = expectedNavigationStage(activeTask);
    const routeChanged = (
      previous?.id !== activeTask?.id
      || previousStage !== nextStage
    );

    activeTaskRef.current = activeTask;
    if (routeChanged) {
      navigationPathRef.current = undefined;
      setNavigationPath(undefined);
      setNavigationPathStatus(
        nextStage ? "waiting" : "unavailable"
      );
    }

    const pending = pendingNavigationPathRef.current;
    const currentMap = occupancyMapRef.current;
    if (
      pending
      && activeTask
      && pending.taskId === activeTask.id
      && pending.stage === nextStage
      && pending.robotId === robotRef.current.id
      && Date.now() - pending.receivedAt <= 5000
      && (
        !currentMap
        || framesAreCompatible(
          pending.frameId,
          currentMap.frameId
        )
      )
    ) {
      navigationPathRef.current = pending;
      setNavigationPath(pending);
      setNavigationPathStatus("live");
    }
    pendingNavigationPathRef.current = undefined;
  }, [activeTask]);

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
            pendingNavigationPathRef.current = undefined;
            navigationPathRef.current = undefined;
            setNavigationPath(undefined);
            setNavigationPathStatus("waiting");
            void refreshAll();
          } else if (message.type === "navigation_path") {
            const nextPath = parseNavigationPath(message);
            const currentTask = activeTaskRef.current;
            const expectedStage = expectedNavigationStage(
              currentTask
            );
            const currentMap = occupancyMapRef.current;
            const currentPath = navigationPathRef.current;

            if (nextPath && !currentTask) {
              pendingNavigationPathRef.current = nextPath;
            }

            if (
              nextPath
              && currentTask
              && expectedStage === nextPath.stage
              && nextPath.taskId === currentTask.id
              && nextPath.robotId === robotRef.current.id
              && (
                !currentMap
                || framesAreCompatible(
                  nextPath.frameId,
                  currentMap.frameId
                )
              )
              && !(
                currentPath
                && currentPath.taskId === nextPath.taskId
                && currentPath.stage === nextPath.stage
                && currentPath.commandId !== nextPath.commandId
              )
            ) {
              navigationPathRef.current = nextPath;
              setNavigationPath(nextPath);
              setNavigationPathStatus("live");
            }
          } else if (
            message.type === "navigation_path_clear"
          ) {
            const clear = parseNavigationPathClear(message);
            const currentTask = activeTaskRef.current;
            const expectedStage = expectedNavigationStage(
              currentTask
            );
            const currentPath = navigationPathRef.current;

            if (
              clear
              && clear.robotId === robotRef.current.id
              && clear.taskId === currentTask?.id
              && clear.stage === expectedStage
              && (
                !currentPath
                || currentPath.commandId === clear.commandId
              )
            ) {
              navigationPathRef.current = undefined;
              setNavigationPath(undefined);
              setNavigationPathStatus(
                clear.reason === "robot_disconnect"
                  ? "unavailable"
                  : "waiting"
              );
            }
          } else if (
            message.type === "navigation_feedback"
          ) {
            const feedbackMessage =
              message as NavigationFeedbackMessage;

            setNavigationFeedback({
              robotId: feedbackMessage.robot_id,
              commandId: feedbackMessage.command_id,
              taskId: feedbackMessage.task_id,
              stage: feedbackMessage.stage,
              distanceRemaining:
                feedbackMessage.distance_remaining,
              navigationTimeSeconds:
                feedbackMessage.navigation_time_seconds,
              estimatedTimeRemainingSeconds:
                feedbackMessage
                  .estimated_time_remaining_seconds
                ?? undefined,
              numberOfRecoveries:
                feedbackMessage.number_of_recoveries,
              linearVelocity:
                feedbackMessage.linear_velocity
                ?? undefined,
              angularVelocity:
                feedbackMessage.angular_velocity
                ?? undefined,
              currentPose: {
                frameId:
                  feedbackMessage.current_pose.frame_id,
                x: feedbackMessage.current_pose.x,
                y: feedbackMessage.current_pose.y,
                yaw: feedbackMessage.current_pose.yaw
              },
              timestamp:
                feedbackMessage.timestamp
                ?? undefined,
              serverTime: feedbackMessage.server_time
            });
          } else if (
            message.type === "robot_diagnostics"
          ) {
            const nextDiagnostics =
              parseRobotDiagnostics(message);

            if (nextDiagnostics) {
              setDiagnostics(nextDiagnostics);
            }
          }
        } catch {
          // Ignore malformed WebSocket messages.
        }
      };

      websocket.onclose = () => {
        websocket = null;
        setNavigationFeedback(undefined);
        setDiagnostics(undefined);
        navigationPathRef.current = undefined;
        pendingNavigationPathRef.current = undefined;
        setNavigationPath(undefined);
        setNavigationPathStatus("unavailable");

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
    const interval = window.setInterval(() => {
      const current = navigationPathRef.current;
      if (
        current
        && Date.now() - current.receivedAt > 5000
      ) {
        navigationPathRef.current = undefined;
        setNavigationPath(undefined);
        setNavigationPathStatus("stale");
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    void refreshMap();
    const interval = window.setInterval(
      () => void refreshMap(),
      5000
    );
    return () => window.clearInterval(interval);
  }, [refreshMap]);

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
      navigationFeedback,
      navigationPath,
      navigationPathStatus,
      diagnostics,
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
      navigationFeedback,
      navigationPath,
      navigationPathStatus,
      diagnostics,
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
