"use client";

import { useEffect, useState } from "react";

import { useLocale } from "@/context/LocaleContext";
import { getAudit } from "@/lib/api";
import { auditActionLabel, supportedAuditActions } from "@/lib/i18n";
import type { AuditRecord } from "@/types";

const actions = ["", ...supportedAuditActions];

export default function AuditPage() {
  const { locale, t } = useLocale();
  const [items, setItems] = useState<AuditRecord[]>([]);
  const [nextOffset, setNextOffset] = useState<number>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState("");

  const load = async (next = action) => {
    setLoading(true);
    try {
      const page = await getAudit(0, 30, next || undefined);
      setItems(page.items);
      setNextOffset(page.nextOffset);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("backendOffline"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(""); }, []);

  const loadMore = async () => {
    if (nextOffset === undefined) return;
    setLoading(true);
    try {
      const page = await getAudit(nextOffset, 30, action || undefined);
      setItems((current) => [...current, ...page.items]);
      setNextOffset(page.nextOffset);
      setError(undefined);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t("backendOffline"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-6xl">
      <h1 className="text-2xl font-bold">{t("audit")}</h1>
      <p className="mb-5 text-sm text-slate-500">{t("auditDescription")}</p>
      <label className="mb-4 block text-sm font-semibold">
        {t("auditActionFilter")}
        <select value={action} onChange={(event) => { setAction(event.target.value); void load(event.target.value); }} className="ml-2 min-h-10 rounded border p-2">
          {actions.map((value) => <option key={value} value={value}>{value ? auditActionLabel(value, locale) : t("allActions")}</option>)}
        </select>
      </label>
      {loading ? <p>{t("loading")}</p> : error ? <p role="alert">{error} <button onClick={() => void load()} className="underline">{t("retry")}</button></p> : !items.length ? <p className="rounded-xl border p-5 text-slate-500">{t("auditNoRecords")}</p> : (
        <div className="overflow-x-auto rounded-xl border">
          <table className="min-w-[650px] w-full text-left text-sm">
            <thead><tr className="bg-slate-50"><th className="p-3">{t("auditTime")}</th><th>{t("auditAction")}</th><th>{t("auditActor")}</th><th>{t("auditEntity")}</th><th>{t("auditResult")}</th></tr></thead>
            <tbody>{items.map((item) => <tr key={item.id} className="border-t"><td className="p-3">{new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "medium" }).format(new Date(item.createdAt))}</td><td>{auditActionLabel(item.action, locale)}</td><td>{item.actorType === "SYSTEM" ? t("system") : `${item.actorType}: ${item.actorIdentifier ?? item.actorId ?? ""}`}</td><td>{item.entityType} {item.entityId ?? ""}</td><td>{item.result}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {!loading && !error && nextOffset !== undefined && (
        <button type="button" onClick={() => void loadMore()} className="mt-4 min-h-11 rounded border px-4">
          {t("loadMore")}
        </button>
      )}
    </section>
  );
}
