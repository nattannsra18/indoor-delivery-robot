"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { getNotifications, markAllNotificationsRead, markNotificationsRead } from "@/lib/api";
import { notificationCopy, notificationPageText } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n";
import type { Notification, NotificationPage } from "@/types";

type Filter = "all" | "unread" | "action" | "critical" | "delivery";
type TimelineEntry = { item: Notification; ids: string[]; unreadIds: string[]; count: number };
type NotificationGroup = { key: string; taskId?: string; entries: TimelineEntry[]; unreadCount: number; latestAt: string };

function category(item: Notification): Exclude<Filter, "all" | "unread"> {
  if (item.category === "CRITICAL") return "critical";
  if (item.category === "ACTION_REQUIRED") return "action";
  return "delivery";
}

function requestFilter(filter: Filter): {category?: Notification["category"]; unreadOnly?: boolean} {
  if (filter === "unread") return {unreadOnly: true};
  if (filter === "action") return {category: "ACTION_REQUIRED"};
  if (filter === "critical") return {category: "CRITICAL"};
  if (filter === "delivery") return {category: "DELIVERY"};
  return {};
}

function iconFor(item: Notification) {
  const kind = category(item);
  if (kind === "critical" || kind === "action") return <path d="M12 8v5m0 3.2v.2M10.1 4.5 3.3 17a2 2 0 0 0 1.7 3h14a2 2 0 0 0 1.7-3L13.9 4.5a2.2 2.2 0 0 0-3.8 0Z" strokeLinecap="round" strokeLinejoin="round"/>;
  if (item.eventType.includes("arrived") || item.eventType.includes("received")) return <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.6 2.6L16.5 9"/></>;
  return <path d="M5 8.5 12 12l7-3.5M5 8.5 12 5l7 3.5v7L12 19l-7-3.5v-7ZM12 12v7"/>;
}

function buildGroups(items: Notification[]): NotificationGroup[] {
  const groups = new Map<string, NotificationGroup>();
  for (const item of items) {
    const key = item.entityType === "task" && item.entityId ? `task:${item.entityId}` : `event:${item.id}`;
    const group = groups.get(key) ?? { key, taskId: item.entityType === "task" ? item.entityId : undefined, entries: [], unreadCount: 0, latestAt: item.createdAt };
    const duplicate = group.entries.find((entry) => entry.item.eventType === item.eventType && entry.item.title === item.title);
    if (duplicate) {
      duplicate.ids.push(item.id); duplicate.count += 1;
      if (!item.readAt) duplicate.unreadIds.push(item.id);
    } else {
      group.entries.push({ item, ids: [item.id], unreadIds: item.readAt ? [] : [item.id], count: 1 });
    }
    if (!item.readAt) group.unreadCount += 1;
    if (Date.parse(item.createdAt) > Date.parse(group.latestAt)) group.latestAt = item.createdAt;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => Date.parse(right.latestAt) - Date.parse(left.latestAt));
}

function timeLabel(value: string, locale: Locale) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function NotificationsPage() {
  const { locale, t } = useLocale();
  const copy = notificationPageText[locale];
  const [page, setPage] = useState<NotificationPage>();
  const [filter, setFilter] = useState<Filter>("all");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [marking, setMarking] = useState(false);

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try { setPage(await getNotifications(0, 30, requestFilter(filter))); setError(""); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("notificationsLoadError")); }
    finally { if (showLoading) setLoading(false); }
  }, [filter, t]);

  useEffect(() => {
    void load();
    const refresh = (event: Event) => { if (!(event instanceof CustomEvent && event.detail?.source === "notifications-page")) void load(false); };
    window.addEventListener("idr:notification", refresh);
    return () => window.removeEventListener("idr:notification", refresh);
  }, [load]);

  const groups = useMemo(() => buildGroups(page?.items ?? []), [page?.items]);
  const criticalCount = page?.unreadByCategory.CRITICAL ?? 0;

  async function markIds(ids: string[]) {
    if (!ids.length || marking) return;
    setMarking(true);
    try {
      await markNotificationsRead(ids);
      await load(false);
      window.dispatchEvent(new CustomEvent("idr:notification", { detail: { source: "notifications-page" } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("notificationsLoadError")); }
    finally { setMarking(false); }
  }

  async function markAll() {
    if (!page?.unreadCount || marking) return;
    setMarking(true);
    try {
      await markAllNotificationsRead();
      const readAt = new Date().toISOString();
      setPage((current) => current && ({ ...current, unreadCount: 0, unreadByCategory: {}, items: current.items.map((item) => ({ ...item, readAt: item.readAt ?? readAt })) }));
      window.dispatchEvent(new CustomEvent("idr:notification", { detail: { source: "notifications-page" } }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : t("notificationsLoadError")); }
    finally { setMarking(false); }
  }

  async function loadMore() {
    if (page?.nextOffset === undefined) return;
    setLoadingMore(true);
    try { const next = await getNotifications(page.nextOffset, 30, requestFilter(filter)); setPage({ ...next, items: [...page.items, ...next.items] }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : t("notificationsLoadError")); }
    finally { setLoadingMore(false); }
  }

  return <section className="mx-auto max-w-6xl pb-10">
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><div><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-bold text-slate-950">{t("notifications")}</h1>{!!page?.unreadCount && <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-700">{page.unreadCount > 99 ? "99+" : page.unreadCount} {t("unread")}</span>}</div><p className="mt-1 text-sm text-slate-500">{copy.description}</p></div><button type="button" disabled={marking || !page?.unreadCount} onClick={() => void markAll()} className="min-h-11 self-start rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm disabled:opacity-50">{marking ? copy.markingRead : t("markAllRead")}</button></header>

    {criticalCount > 0 && <aside className="mb-5 flex flex-col gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-rose-900">{copy.criticalTitle.replace("{count}", String(criticalCount))}</p><p className="mt-1 text-sm text-rose-700">{copy.criticalHelp}</p></div><button type="button" onClick={() => setFilter("critical")} className="min-h-10 self-start rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white">{copy.reviewCritical}</button></aside>}

    <div className="mb-5 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-sm" role="group" aria-label={copy.filterLabel}>{(["all", "unread", "action", "critical", "delivery"] as const).map((value) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={`min-h-10 shrink-0 rounded-xl px-4 py-2 text-sm font-bold transition ${filter === value ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}>{copy[`filter_${value}`]}</button>)}</div>

    {error && <div role="alert" className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><span>{error}</span><button type="button" onClick={() => void load()} className="rounded-lg bg-white px-3 py-2 font-bold">{t("retry")}</button></div>}
    {loading ? <div aria-live="polite" aria-busy="true" className="grid gap-3"><span className="sr-only">{t("loading")}</span>{[0,1,2].map((item) => <div key={item} className="h-32 animate-pulse rounded-2xl bg-slate-100" />)}</div> : groups.length === 0 ? <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center"><h2 className="font-bold text-slate-900">{filter === "all" ? t("noNotifications") : copy.caughtUp}</h2><p className="mt-1 text-sm text-slate-500">{copy.caughtUpHelp}</p></div> : <div className="space-y-4">{groups.map((group) => <article key={group.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4"><div><div className="flex items-center gap-2"><h2 className="font-bold text-slate-950">{group.taskId ?? copy.systemUpdates}</h2>{group.unreadCount > 0 && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-bold text-white">{group.unreadCount}</span>}</div><p className="mt-1 text-xs text-slate-400">{timeLabel(group.latestAt, locale)} · {copy.updateCount.replace("{count}", String(group.entries.reduce((sum, entry) => sum + entry.count, 0)))}</p></div><div className="flex items-center gap-2">{group.taskId && <Link href={`/tasks?task=${encodeURIComponent(group.taskId)}`} className="min-h-10 rounded-lg px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-50">{copy.viewDelivery} →</Link>}{group.unreadCount > 0 && <button type="button" disabled={marking} onClick={() => void markIds(group.entries.flatMap((entry) => entry.unreadIds))} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-600 disabled:opacity-50">{copy.markGroupRead}</button>}</div></header>
      <ol className="divide-y divide-slate-100">{group.entries.map((entry) => { const localized = notificationCopy(entry.item.eventType, entry.item.title, entry.item.message, locale); const tone = category(entry.item); return <li key={`${entry.item.eventType}:${entry.item.id}`} className={`grid grid-cols-[auto_minmax(0,1fr)] gap-3 px-5 py-4 ${entry.unreadIds.length ? "bg-blue-50/35" : ""}`}><span className={`grid h-10 w-10 place-items-center rounded-xl ${tone === "critical" ? "bg-rose-100 text-rose-700" : tone === "action" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8">{iconFor(entry.item)}</svg></span><div><div className="flex flex-wrap items-center gap-2"><p className="font-bold text-slate-900">{localized[0]}</p>{entry.count > 1 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">×{entry.count}</span>}{entry.unreadIds.length > 0 && <span className="h-2 w-2 rounded-full bg-blue-600" aria-label={t("unread")} />}</div><p className="mt-1 text-sm leading-6 text-slate-600">{localized[1]}</p><time className="mt-2 block text-xs text-slate-400" dateTime={entry.item.createdAt}>{timeLabel(entry.item.createdAt, locale)}</time></div></li>; })}</ol>
    </article>)}</div>}
    {page?.nextOffset !== undefined && <div className="mt-6 text-center"><button type="button" disabled={loadingMore} onClick={() => void loadMore()} className="min-h-11 rounded-xl border border-slate-200 bg-white px-5 py-2 text-sm font-bold text-slate-700 shadow-sm disabled:opacity-50">{loadingMore ? copy.loadingMore : t("loadMore")}</button></div>}
  </section>;
}
