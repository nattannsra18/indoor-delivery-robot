import type { DeliveryTask, TaskEstimate } from "@/types";

export type EtaValue =
  | { state: "estimate"; seconds: number; arrivalAt: string }
  | { state: "arrived" | "picked-up" | "awaiting-confirmation" | "completed" }
  | { state: "calculating" | "unavailable" };

export type TaskEtaDisplay = {
  queuePosition?: number;
  pickup: EtaValue;
  destination: EtaValue;
};

function validSeconds(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

function estimateValue(seconds: number | undefined, generatedAt: string | undefined): EtaValue {
  if (!validSeconds(seconds) || !generatedAt) return { state: "unavailable" };
  const generated = Date.parse(generatedAt);
  if (!Number.isFinite(generated)) return { state: "unavailable" };
  return {
    state: "estimate",
    seconds,
    arrivalAt: new Date(generated + seconds * 1000).toISOString()
  };
}

function estimateForTask(
  task: DeliveryTask,
  estimate: TaskEstimate | undefined
): TaskEstimate | undefined {
  return estimate?.taskId === task.id && estimate.status === task.status
    ? estimate
    : undefined;
}

export function buildTaskEtaDisplay(
  task: DeliveryTask,
  estimate: TaskEstimate | undefined
): TaskEtaDisplay {
  const matchingEstimate = estimateForTask(task, estimate);
  switch (task.status) {
    case "QUEUED":
      return {
        queuePosition: matchingEstimate?.queuePosition,
        pickup: estimateValue(matchingEstimate?.pickupEtaSeconds, matchingEstimate?.generatedAt),
        destination: estimateValue(matchingEstimate?.destinationEtaSeconds, matchingEstimate?.generatedAt)
      };
    case "GOING_TO_PICKUP":
      return {
        pickup: estimateValue(matchingEstimate?.pickupEtaSeconds, matchingEstimate?.generatedAt),
        destination: estimateValue(matchingEstimate?.destinationEtaSeconds, matchingEstimate?.generatedAt)
      };
    case "WAITING_FOR_LOADING":
      return {
        pickup: { state: "arrived" },
        destination: estimateValue(matchingEstimate?.destinationEtaSeconds, matchingEstimate?.generatedAt)
      };
    case "DELIVERING":
      return {
        pickup: { state: "picked-up" },
        destination: estimateValue(matchingEstimate?.destinationEtaSeconds, matchingEstimate?.generatedAt)
      };
    case "WAITING_FOR_UNLOADING":
      return {
        pickup: { state: "picked-up" },
        destination: { state: "awaiting-confirmation" }
      };
    case "COMPLETED":
      return {
        pickup: { state: "picked-up" },
        destination: { state: "completed" }
      };
    default:
      return {
        pickup: { state: "unavailable" },
        destination: { state: "unavailable" }
      };
  }
}

export function formatEtaDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "Unavailable";
  const minutes = Math.max(1, Math.round(seconds / 60));
  return `About ${minutes} min`;
}
