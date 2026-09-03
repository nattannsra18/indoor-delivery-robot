import type { TaskPriority, UserIdentity } from "@/types";

export type TaskCreationAction = "invalid" | "review" | "create";

export function taskCreationAction(
  valid: boolean,
  reviewing: boolean,
  submitting: boolean
): TaskCreationAction {
  if (!valid || submitting) return "invalid";
  return reviewing ? "create" : "review";
}

export function allowedPriority(
  role: UserIdentity["role"] | undefined,
  requested: TaskPriority
): TaskPriority {
  return role === "ADMIN" ? requested : "NORMAL";
}
