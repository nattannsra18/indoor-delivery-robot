import type { DeliveryTask, NavigationFeedback } from "@/types";

/**
 * Present route-aware progress while Nav2 feedback is fresh and associated
 * with the active task. Human handoff stages retain explicit milestones.
 */
export function displayedTaskProgress(
  task: DeliveryTask,
  feedback?: NavigationFeedback
): number {
  if (
    feedback?.taskId === task.id
    && feedback.stage === "pickup"
    && task.status === "GOING_TO_PICKUP"
  ) {
    return routeProgress(
      task.pickupDistanceMeters,
      feedback.distanceRemaining,
      5,
      30
    );
  }
  if (
    feedback?.taskId === task.id
    && feedback.stage === "destination"
    && task.status === "DELIVERING"
  ) {
    return routeProgress(
      task.deliveryDistanceMeters,
      feedback.distanceRemaining,
      40,
      85
    );
  }
  return task.progress;
}

function routeProgress(
  totalDistance: number | undefined,
  remainingDistance: number,
  start: number,
  end: number
): number {
  if (
    totalDistance === undefined
    || !Number.isFinite(totalDistance)
    || totalDistance <= 0
    || !Number.isFinite(remainingDistance)
  ) return start;

  const completedFraction = Math.max(
    0,
    Math.min(1, 1 - Math.max(0, remainingDistance) / totalDistance)
  );
  return Math.round(start + completedFraction * (end - start));
}
