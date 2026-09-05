"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import { notificationCopy, notificationPageText } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import type { Notification, NotificationPage } from "@/types";
import { useLocale } from "@/context/LocaleContext";

type Filter = "all" | "unread";
type NotificationTone = "blue" | "emerald" | "amber" | "rose" | "violet";

const toneClasses: Record<NotificationTone, string> = {
  blue: "bg-blue-50 text-blue-700 ring-blue-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
};

function notificationTone(eventType: string): NotificationTone {
  if (eventType.includes("failed") || eventType.includes("emergency")) return "rose";
  if (eventType.startsWith("alert.")) return "amber";
  if (eventType.includes("arrived") || eventType.includes("confirm_received")) return "emerald";
  if (eventType.includes("confirm_loaded")) return "violet";
  return "blue";
}

function NotificationIcon({ eventType }: { eventType: string }) {
  if (eventType.includes("failed") || eventType.includes("emergency") || eventType.startsWith("alert.")) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
        <path d="M12 8v5m0 3.25v.25M10.1 4.45 3.25 17a2 2 0 0 0 1.76 3h13.98a2 2 0 0 0 1.76-3L13.9 4.45a2.16 2.16 0 0 0-3.8 0Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (eventType.includes("arrived") || eventType.includes("confirm_received")) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
        <path d="m7.5 12.5 3 3 6-7M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (eventType.includes("confirm_loaded")) {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
        <path d="M5 8.5 12 12l7-3.5M5 8.5 12 5l7 3.5v7L12 19l-7-3.5v-7ZM12 12v7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">
      <path d="M12 3a7 7 0 0 0-7 7v3.2l-1.5 2.6h17L19 13.2V10a7 7 0 0 0-7-7Zm-2.5 16a2.75 2.75 0 0 0 5 0" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function dayKey(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(value: string, locale: Locale, now: Date, copy: Record<string, string>) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (dayKey(value) === dayKey(now.toISOString())) return copy.today;
  if (dayKey(value) === dayKey(yesterday.toISOString())) return copy.yesterday;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);
}

function relativeTime(value: string, locale: Locale, now: Date, justNow: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  if (Math.abs(seconds) < 45) return justNow;
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(seconds) < 3600) return formatter.format(Math.round(seconds / 60), "minute");
  if (Math.abs(seconds) < 86400) return formatter.format(Math.round(seconds / 3600), "hour");
  return formatter.format(Math.round(seconds / 86400), "day");
}

export default function NotificationsPage() {
  const { locale, t } = useLocale();
  const copy = notificationPageText[locale];
  const [page, setPage] = useState<NotificationPage>();
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string>();
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      setPage(await getNotifications());
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("notificationsLoadError"));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    const refresh = (event: Event) => {
      if (event instanceof CustomEvent && event.detail?.source === "notifications-page") return;
      void load(false);
    };
    window.addEventListener("idr:notification", refresh);
    return () => window.removeEventListener("idr:notification", refresh);
  }, [load]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const loadMore = async () => {
    if (page?.nextOffset === undefined) return;
    setLoadingMore(true);
    try {
      const next = await getNotifications(page.nextOffset);
      setPage({ ...next, items: [...page.items, ...next.items] });
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("notificationsLoadError"));
    } finally {
      setLoadingMore(false);
    }
  };

  const mark = async (item: Notification) => {
    if (item.readAt || markingId) return;
    setMarkingId(item.id);
    try {
      const updated = await markNotificationRead(item.id);
      setPage((current) => current && ({
        ...current,
        unreadCount: Math.max(0, current.unreadCount - 1),
        items: current.items.map((entry) => entry.id === item.id ? updated : entry),
      }));
      setError(undefined);
      window.dispatchEvent(new CustomEvent("idr:notification", {
        detail: { source: "notifications-page" },
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("notificationsLoadError"));
    } finally {
      setMarkingId(undefined);
    }
  };

  const markAll = async () => {
    if (!page?.unreadCount || markingAll) return;
    setMarkingAll(true);
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setPage((current) => current && ({
        ...current,
        unreadCount: 0,
        items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? readAt })),
      }));
      setError(undefined);
      window.dispatchEvent(new CustomEvent("idr:notification", {
        detail: { source: "notifications-page" },
      }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("notificationsLoadError"));
    } finally {
      setMarkingAll(false);
    }
  };

  const visibleItems = useMemo(
    () => (page?.items ?? []).filter((item) => filter === "all" || !item.readAt),
    [filter, page?.items],
  );
  const groups = useMemo(() => {
    const result: Array<{ key: string; label: string; items: Notification[] }> = [];
    for (const item of visibleItems) {
      const key = dayKey(item.createdAt);
      const last = result.at(-1);
      if (!last || last.key !== key) {
        result.push({ key, label: dayLabel(item.createdAt, locale, now, copy), items: [item] });
      } else {
        last.items.push(item);
      }
    }
    return result;
  }, [copy, locale, now, visibleItems]);

  const exactDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
  };
  const clockTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);
  };

  return (
    <section className="mx-auto max-w-5xl pb-10">
      <header className="mb-6 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200">
            <NotificationIcon eventType="notification" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">{t("notifications")}</h1>
              {!!page?.unreadCount && (
                <span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">
                  {page.unreadCount} {t("unread")}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-500 md:text-base">{copy.description}</p>
          </div>
        </div>
        <button
          type="button"
          disabled={markingAll || !page?.unreadCount}
          onClick={() => void markAll()}
          className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-45 sm:self-auto"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
            <path d="m3.5 12 3.2 3.2L12 9.9m-.5 5.1 2.1 2.1L20.5 10" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {markingAll ? copy.markingRead : t("markAllRead")}
        </button>
      </header>

      <div className="mb-5 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="grid grid-cols-2 rounded-xl bg-slate-100 p-1" role="group" aria-label={copy.filterLabel}>
          {(["all", "unread"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
              className={`min-h-10 rounded-lg px-5 py-2 text-sm font-semibold transition ${filter === value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
            >
              {value === "all" ? copy.all : copy.unreadOnly}
              {value === "unread" && !!page?.unreadCount && (
                <span className="ml-2 rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white">{page.unreadCount}</span>
              )}
            </button>
          ))}
        </div>
        <p className="px-3 pb-2 text-xs font-medium text-slate-400 sm:pb-0">{copy.newestFirst}</p>
      </div>

      {error && (
        <div role="alert" className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="min-h-10 self-start rounded-lg bg-white px-3 py-2 font-semibold shadow-sm sm:self-auto">{t("retry")}</button>
        </div>
      )}

      {loading ? (
        <div aria-live="polite" aria-busy="true" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="sr-only">{t("loading")}</span>
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="flex gap-4 border-b border-slate-100 py-5 last:border-0">
              <span className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-slate-100" />
              <span className="flex-1 space-y-2">
                <span className="block h-4 w-48 animate-pulse rounded bg-slate-100" />
                <span className="block h-3 w-72 max-w-full animate-pulse rounded bg-slate-100" />
              </span>
            </div>
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center shadow-sm">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
            <NotificationIcon eventType="task.arrived_destination" />
          </span>
          <h2 className="mt-4 text-lg font-bold text-slate-900">
            {filter === "unread"
              ? (page?.unreadCount ? copy.unreadFurther : copy.caughtUp)
              : t("noNotifications")}
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-slate-500">
            {filter === "unread"
              ? (page?.unreadCount ? copy.unreadFurtherHelp : copy.caughtUpHelp)
              : copy.emptyHelp}
          </p>
          {filter === "unread" && page?.unreadCount && page.nextOffset !== undefined && (
            <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="mt-5 min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-blue-700 shadow-sm disabled:opacity-50">
              {loadingMore ? copy.loadingMore : t("loadMore")}
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`notification-day-${group.key}`}>
              <div className="mb-2 flex items-center gap-3 px-1">
                <h2 id={`notification-day-${group.key}`} className="text-sm font-bold text-slate-700">{group.label}</h2>
                <span className="h-px flex-1 bg-slate-200" />
              </div>
              <ul className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                {group.items.map((item) => {
                  const localized = notificationCopy(item.eventType, item.title, item.message, locale);
                  const tone = notificationTone(item.eventType);
                  const unread = !item.readAt;
                  return (
                    <li key={item.id} className={`relative grid gap-3 border-b border-slate-100 p-4 transition last:border-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-4 sm:px-5 ${unread ? "bg-blue-50/45" : "bg-white hover:bg-slate-50/70"}`}>
                      {unread && <span aria-hidden="true" className="absolute inset-y-3 left-0 w-1 rounded-r-full bg-blue-600" />}
                      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${toneClasses[tone]}`}>
                        <NotificationIcon eventType={item.eventType} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`truncate text-[0.95rem] text-slate-950 ${unread ? "font-bold" : "font-semibold"}`}>{localized[0]}</p>
                          {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" aria-label={t("unread")} />}
                        </div>
                        <p className="mt-0.5 text-sm leading-5 text-slate-600">{localized[1]}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                          <time dateTime={item.createdAt} title={exactDate(item.createdAt)}>
                            {relativeTime(item.createdAt, locale, now, copy.justNow)} · {clockTime(item.createdAt)}
                          </time>
                          {item.entityType === "task" && item.entityId && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 font-semibold text-slate-600">{item.entityId}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 pl-14 sm:pl-0">
                        {item.entityType === "task" && item.entityId && (
                          <Link href="/tasks" onClick={() => void mark(item)} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50">
                            {copy.viewDelivery}<span aria-hidden="true">→</span>
                          </Link>
                        )}
                        {unread && (
                          <button
                            type="button"
                            disabled={markingId !== undefined}
                            onClick={() => void mark(item)}
                            aria-label={`${t("markRead")}: ${localized[0]}`}
                            title={t("markRead")}
                            className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-50"
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current" strokeWidth="2">
                              <path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {page?.nextOffset !== undefined && (
            <div className="flex justify-center pt-1">
              <button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-blue-700 disabled:opacity-50">
                {loadingMore ? copy.loadingMore : t("loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
