"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { getPendingAccounts } from "@/lib/api";
import { accountRequestNoticeText } from "@/lib/i18n";

const FALLBACK_REFRESH_MS = 30_000;

export default function AccountRequestNotice() {
  const { user } = useAuth();
  const { locale } = useLocale();
  const copy = accountRequestNoticeText[locale];
  const [count, setCount] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const previousCount = useRef(0);

  const refresh = useCallback(async () => {
    if (user?.role !== "ADMIN") return;
    try {
      const accounts = await getPendingAccounts();
      const nextCount = accounts.length;
      if (nextCount > previousCount.current) setDismissed(false);
      previousCount.current = nextCount;
      setCount(nextCount);
    } catch {
      // The global backend status already reports connectivity failures.
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    void refresh();
    const handleChange = () => void refresh();
    const interval = window.setInterval(handleChange, FALLBACK_REFRESH_MS);
    window.addEventListener("idr:notification", handleChange);
    window.addEventListener("idr:account-request", handleChange);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("idr:notification", handleChange);
      window.removeEventListener("idr:account-request", handleChange);
    };
  }, [refresh, user?.role]);

  if (user?.role !== "ADMIN" || count === 0 || dismissed) return null;

  return (
    <aside
      aria-live="polite"
      className="mb-5 flex flex-col gap-4 rounded-2xl border border-amber-200 bg-amber-50/90 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="9" cy="8" r="3" />
            <path d="M3.5 20v-1a5.5 5.5 0 0 1 11 0v1M17 9v6M14 12h6" />
          </svg>
        </span>
        <div>
          <p className="font-bold text-amber-950">{copy.title.replace("{count}", String(count))}</p>
          <p className="mt-1 text-sm leading-5 text-amber-800">{copy.description}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-14 sm:pl-0">
        <Link href="/users" className="inline-flex min-h-10 items-center rounded-xl bg-amber-700 px-4 py-2 text-sm font-bold text-white transition hover:bg-amber-800">
          {copy.review} →
        </Link>
        <button type="button" onClick={() => setDismissed(true)} aria-label={copy.dismiss} className="grid h-10 w-10 place-items-center rounded-xl text-xl text-amber-700 hover:bg-amber-100">
          ×
        </button>
      </div>
    </aside>
  );
}
