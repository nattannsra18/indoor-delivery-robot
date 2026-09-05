import type { DeliveryTask, TaskStatus, UserIdentity } from "@/types";

export type NavigationItem = {
  href: string;
  label: string;
  icon: string;
};

export const ACTIVE_TASK_STATUSES: readonly TaskStatus[] = [
  "GOING_TO_PICKUP",
  "WAITING_FOR_LOADING",
  "DELIVERING",
  "WAITING_FOR_UNLOADING"
];

export const TERMINAL_TASK_STATUSES: readonly TaskStatus[] = [
  "COMPLETED",
  "FAILED",
  "CANCELLED"
];

const SHARED_NAVIGATION: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/delivery", label: "Create Delivery", icon: "＋" },
  { href: "/tasks", label: "My Tasks", icon: "≡" }
  , { href: "/notifications", label: "Notifications", icon: "●" }
];

const ADMIN_NAVIGATION: NavigationItem[] = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/delivery", label: "Create Delivery", icon: "＋" },
  { href: "/tasks", label: "All Tasks", icon: "≡" },
  { href: "/maps", label: "Map Management", icon: "◇" },
  { href: "/stations", label: "Station Management", icon: "⌖" },
  { href: "/users", label: "Account Requests", icon: "◎" },
  { href: "/notifications", label: "Notifications", icon: "●" }
  , { href: "/audit", label: "Audit Log", icon: "▤" }
];

const ADMIN_ONLY_ROUTES = ["/maps", "/stations", "/users", "/audit"];

export function navigationForRole(
  role: UserIdentity["role"]
): NavigationItem[] {
  return role === "ADMIN" ? ADMIN_NAVIGATION : SHARED_NAVIGATION;
}

export function routeAllowedForRole(
  pathname: string,
  role: UserIdentity["role"]
): boolean {
  return role === "ADMIN" || !ADMIN_ONLY_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );
}

export function dashboardRequestsForRole(
  role: UserIdentity["role"]
): string[] {
  const shared = ["overview", "stations", "tasks"];
  return role === "ADMIN" ? [...shared, "emergency-stop"] : shared;
}

export function classifyMyDeliveries(tasks: DeliveryTask[]) {
  const newestFirst = [...tasks].sort((left, right) => {
    const timestampDifference =
      Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return timestampDifference || right.id.localeCompare(left.id);
  });
  const active = newestFirst.find((task) =>
    ACTIVE_TASK_STATUSES.includes(task.status)
  );
  const pending = newestFirst.filter((task) => task.status === "QUEUED");
  const recent = newestFirst.filter((task) =>
    TERMINAL_TASK_STATUSES.includes(task.status)
  );
  return { active, pending, recent };
}

export function myDeliveriesViewState(
  loading: boolean,
  backendOnline: boolean,
  taskCount: number
): "loading" | "error" | "empty" | "ready" {
  if (loading) return "loading";
  if (!backendOnline) return "error";
  return taskCount === 0 ? "empty" : "ready";
}

export function taskStatusCounts(tasks: DeliveryTask[]) {
  return {
    active: tasks.filter((task) =>
      ACTIVE_TASK_STATUSES.includes(task.status)
    ).length,
    queued: tasks.filter((task) => task.status === "QUEUED").length,
    failed: tasks.filter((task) => task.status === "FAILED").length,
    completed: tasks.filter((task) => task.status === "COMPLETED").length
  };
}

export function formatTaskTimestamp(value: string, locale?: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}
