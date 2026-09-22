"use client";

import { ReactNode, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { ApiDeliveryProvider, useDeliveryApi } from "@/context/ApiDeliveryContext";
import { API_BASE_URL } from "@/lib/api";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AlertCenter from "@/components/AlertCenter";
import AccountRequestNotice from "@/components/AccountRequestNotice";
import { routeAllowedForRole } from "@/lib/roleDashboard";
import { LocaleProvider } from "@/context/LocaleContext";
import { useLocale } from "@/context/LocaleContext";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider><AuthProvider><AuthGate>{children}</AuthGate></AuthProvider></LocaleProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const authPage = ["/login", "/signup", "/forgot-password", "/reset-password"].includes(pathname);
  const { t } = useLocale();
  useEffect(() => {
    if (!loading && !user && !authPage) router.replace("/login");
    if (
      !loading
      && user
      && !authPage
      && !routeAllowedForRole(pathname, user.role)
    ) router.replace("/");
    if (!loading && user && authPage) router.replace("/");
  }, [loading, user, authPage, pathname, router]);
  const routeAllowed = !user || routeAllowedForRole(pathname, user.role);
  if (loading || (!user && !authPage) || (user && authPage) || !routeAllowed) {
    return <main className="grid min-h-screen place-items-center text-sm text-slate-500">{t("loading")}</main>;
  }
  if (authPage) return children;
  return <ApiDeliveryProvider><ShellContent>{children}</ShellContent></ApiDeliveryProvider>;
}

function ShellContent({ children }: { children: ReactNode }) {
  const { backendOnline, error, loading, refreshAll } = useDeliveryApi();
  const { user } = useAuth();
  const { t } = useLocale();

  return (
    <div className="min-h-screen bg-[#f4f7fb] lg:flex">
      <Sidebar />
      <div className="min-w-0 flex-1">
        <header className="hidden h-16 items-center justify-end gap-4 border-b border-slate-200 bg-white px-6 lg:flex">
          <CurrentDate />
          {user?.role === "ADMIN" && <div className="[&>div]:mb-0"><AlertCenter /></div>}
          <div className="h-7 w-px bg-slate-200" />
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sm font-bold text-white">{user?.username.slice(0, 1).toUpperCase()}</span>
            <div><p className="text-sm font-semibold text-slate-900">{user?.username}</p><p className="text-xs text-slate-500">{user?.role === "ADMIN" ? "Administrator" : "User"}</p></div>
          </div>
        </header>
        <main className="min-w-0 p-4 md:p-5 lg:p-6">
          <div className="mx-auto w-full max-w-[1880px]">
        {user?.role === "ADMIN" && <div className="mb-4 lg:hidden"><AlertCenter /></div>}
        {user?.role === "ADMIN" && <AccountRequestNotice />}
        {!loading && !backendOnline && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">{t("backendOffline")}</p>
              <p className="mt-1 text-xs leading-5">
                Start the backend at {API_BASE_URL}. {error ? `Error: ${error}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="min-h-10 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
            >
              {t("retry")}
            </button>
          </div>
        )}
        {children}
        </div>
      </main>
      </div>
    </div>
  );
}

function CurrentDate() {
  const [label, setLabel] = useState("");
  useEffect(() => {
    const update = () => setLabel(new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="text-xs font-semibold text-slate-600">{label}</span>;
}
