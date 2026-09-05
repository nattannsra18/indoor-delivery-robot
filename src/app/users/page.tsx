"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useLocale } from "@/context/LocaleContext";
import { approveAccount, getPendingAccounts } from "@/lib/api";
import { formatDate, userManagementText } from "@/lib/i18n";
import type { PendingAccount } from "@/types";

export default function UserManagementPage() {
  const { locale } = useLocale();
  const copy = userManagementText[locale];
  const [accounts, setAccounts] = useState<PendingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [approvingId, setApprovingId] = useState<string>();
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAccounts(await getPendingAccounts());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [copy.loadFailed]);

  useEffect(() => { void load(); }, [load]);

  async function approve(account: PendingAccount) {
    setApprovingId(account.id);
    setMessage("");
    setError("");
    try {
      await approveAccount(account.id);
      setAccounts((current) => current.filter((item) => item.id !== account.id));
      setMessage(copy.approved.replace("{username}", account.username));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.approveFailed);
    } finally {
      setApprovingId(undefined);
    }
  }

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />
      <section className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between md:px-6">
          <div>
            <h2 className="text-lg font-bold text-slate-950">{copy.pendingTitle}</h2>
            <p className="mt-1 text-sm text-slate-500">{copy.pendingHelp}</p>
          </div>
          <span className="self-start rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-700">
            {copy.pendingCount.replace("{count}", String(accounts.length))}
          </span>
        </header>

        {message && <p aria-live="polite" className="m-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{message}</p>}
        {error && <div role="alert" className="m-5 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"><span>{error}</span><button type="button" onClick={() => void load()} className="rounded-lg bg-white px-3 py-2 font-semibold shadow-sm">{copy.retry}</button></div>}

        {loading ? (
          <div className="grid gap-3 p-5 md:p-6" aria-busy="true" aria-live="polite">
            <span className="sr-only">{copy.loading}</span>
            {[0, 1, 2].map((item) => <div key={item} className="h-20 animate-pulse rounded-2xl bg-slate-100" />)}
          </div>
        ) : accounts.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-2xl text-emerald-700">✓</span>
            <h3 className="mt-4 font-bold text-slate-900">{copy.emptyTitle}</h3>
            <p className="mt-1 text-sm text-slate-500">{copy.emptyHelp}</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {accounts.map((account) => (
              <li key={account.id} className="grid gap-4 px-5 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center md:px-6">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-50 font-bold text-blue-700">{account.username.slice(0, 1).toUpperCase()}</span>
                <div className="min-w-0">
                  <p className="font-bold text-slate-950">{account.username}</p>
                  <p className="truncate text-sm text-slate-600">{account.email}</p>
                  <p className="mt-1 text-xs text-slate-400">{copy.requested} {formatDate(account.createdAt, locale)}</p>
                </div>
                <button type="button" disabled={approvingId !== undefined} onClick={() => void approve(account)} className="min-h-11 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50">
                  {approvingId === account.id ? copy.approving : copy.approve}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside className="mt-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-900">
        <strong>{copy.policyTitle}</strong> {copy.policyHelp}
      </aside>
    </>
  );
}
