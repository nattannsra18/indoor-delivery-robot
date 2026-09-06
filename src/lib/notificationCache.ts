import type { NotificationPage } from "@/types";

export type NotificationCacheFilter = "all" | "unread" | "action" | "critical" | "delivery";

const pages = new Map<string, NotificationPage>();

function key(userId: string, filter: NotificationCacheFilter) {
  return `${userId}:${filter}`;
}

export function getCachedNotificationPage(userId: string, filter: NotificationCacheFilter) {
  return pages.get(key(userId, filter));
}

export function setCachedNotificationPage(userId: string, filter: NotificationCacheFilter, page: NotificationPage) {
  pages.set(key(userId, filter), page);
}

export function sameNotificationPage(current: NotificationPage | undefined, next: NotificationPage) {
  return current !== undefined && JSON.stringify(current) === JSON.stringify(next);
}
