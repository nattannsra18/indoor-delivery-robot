import {
  DeliveryTask,
  NavigationFeedback
} from "@/types";

export type QueueEstimate = {
  taskId: string;
  position: number;
  startsInSeconds: number;
  completesInSeconds: number;
  estimatedServiceSeconds: number;
};

const PICKUP_NAVIGATION_SECONDS = 22;
const LOADING_SECONDS = 10;
const DELIVERY_SECONDS = 23;
const UNLOADING_SECONDS = 12;
const EFFECTIVE_SPEED_METERS_PER_SECOND = 0.3;

const ESTIMATED_TASK_SECONDS =
  PICKUP_NAVIGATION_SECONDS
  + LOADING_SECONDS
  + DELIVERY_SECONDS
  + UNLOADING_SECONDS;

export function buildQueueEstimates(
  tasks: DeliveryTask[],
  activeTask: DeliveryTask | undefined,
  feedback: NavigationFeedback | undefined
): QueueEstimate[] {
  const queuedTasks = tasks
    .filter(
      (task) => task.status === "QUEUED"
    )
    .sort(compareTaskIds);

  let availableInSeconds =
    estimateActiveTaskRemaining(
      activeTask,
      feedback
    );

  return queuedTasks.map((task, index) => {
    const startsInSeconds = Math.max(
      0,
      Math.round(availableInSeconds)
    );
    const completesInSeconds = Math.max(
      startsInSeconds,
      Math.round(
        availableInSeconds
        + ESTIMATED_TASK_SECONDS
      )
    );

    availableInSeconds +=
      ESTIMATED_TASK_SECONDS;

    return {
      taskId: task.id,
      position: index + 1,
      startsInSeconds,
      completesInSeconds,
      estimatedServiceSeconds:
        ESTIMATED_TASK_SECONDS
    };
  });
}

function estimateActiveTaskRemaining(
  activeTask: DeliveryTask | undefined,
  feedback: NavigationFeedback | undefined
): number {
  if (!activeTask) {
    return 0;
  }

  switch (activeTask.status) {
    case "GOING_TO_PICKUP":
      return (
        estimateLiveNavigation(
          activeTask.id,
          "pickup",
          feedback,
          PICKUP_NAVIGATION_SECONDS
        )
        + LOADING_SECONDS
        + DELIVERY_SECONDS
        + UNLOADING_SECONDS
      );

    case "WAITING_FOR_LOADING":
      return (
        LOADING_SECONDS
        + DELIVERY_SECONDS
        + UNLOADING_SECONDS
      );

    case "DELIVERING":
      return (
        estimateLiveNavigation(
          activeTask.id,
          "destination",
          feedback,
          DELIVERY_SECONDS
        )
        + UNLOADING_SECONDS
      );

    case "WAITING_FOR_UNLOADING":
      return UNLOADING_SECONDS;

    default:
      return 0;
  }
}

function estimateLiveNavigation(
  taskId: string,
  stage: "pickup" | "destination",
  feedback: NavigationFeedback | undefined,
  fallbackSeconds: number
): number {
  if (
    !feedback
    || feedback.taskId !== taskId
    || feedback.stage !== stage
  ) {
    return fallbackSeconds;
  }

  const distanceEstimate =
    feedback.distanceRemaining
    / EFFECTIVE_SPEED_METERS_PER_SECOND;

  const rawEta =
    feedback.estimatedTimeRemainingSeconds;

  if (
    rawEta === undefined
    || !Number.isFinite(rawEta)
    || rawEta < 0
  ) {
    return distanceEstimate;
  }

  const maximumReasonableEta = Math.max(
    60,
    distanceEstimate * 3
  );

  if (rawEta > maximumReasonableEta) {
    return distanceEstimate;
  }

  return rawEta;
}

function compareTaskIds(
  left: DeliveryTask,
  right: DeliveryTask
): number {
  const leftNumber = taskNumber(left.id);
  const rightNumber = taskNumber(right.id);

  if (leftNumber !== rightNumber) {
    return leftNumber - rightNumber;
  }

  return left.id.localeCompare(right.id);
}

function taskNumber(taskId: string): number {
  const match = taskId.match(/\d+$/);

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number(match[0]);
}