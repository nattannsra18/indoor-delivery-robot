"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { navigationForRole } from "@/lib/roleDashboard";
import { LanguageSwitcher, useLocale } from "@/context/LocaleContext";
import { getNotifications } from "@/lib/api";
import { navigationLabel, sidebarConnectionLabel } from "@/lib/i18n";

export default function Sidebar() {
  const pathname = usePathname();
  const { backendOnline, loading } = useDeliveryApi();
  const { user, logout } = useAuth();
  const navItems = navigationForRole(user?.role ?? "USER");
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  useEffect(() => { let active = true; const refresh = () => { getNotifications(0, 1).then((page) => { if (active) setUnread(page.unreadCount); }).catch(() => {}); }; refresh(); window.addEventListener("idr:notification", refresh); return () => { active = false; window.removeEventListener("idr:notification", refresh); }; }, [pathname]);

  return (
    <aside className="border-b border-slate-200 bg-slate-950 text-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:border-slate-800">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-bold">R</div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{t("appName")}</p>
          <p className="text-xs text-slate-400">{t("controlCenter")}</p>
        </div>
        </div>
        <button type="button" className="min-h-11 min-w-11 rounded border border-slate-700 lg:hidden" aria-label={t("openNavigation")} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((value) => !value)}>☰</button>
      </div>

      <nav id="primary-navigation" className={`${open ? "block" : "hidden"} px-3 pb-4 lg:block lg:space-y-1`}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${active ? "bg-blue-600 font-medium text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.href === "/" ? t("dashboard") : item.href === "/notifications" ? <>{t("notifications")}{unread > 0 && <span aria-label={`${unread} ${t("unread")} ${t("notifications").toLowerCase()}`} className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-blue-700">{unread}</span>}</> : item.href === "/audit" ? t("audit") : navigationLabel(item.href, item.label, locale)}
            </Link>
          );
        })}
      </nav>

      <div className={`${open ? "flex" : "hidden"} items-center justify-between px-5 pb-4 lg:hidden`}><LanguageSwitcher /><button onClick={() => void logout()} className="min-h-10 rounded border border-slate-700 px-3 text-sm">{t("logout")}</button></div>

      <div className="hidden px-5 py-6 lg:block">
        <div className="mb-3 flex items-center justify-between gap-2 text-xs text-slate-300"><span>{user?.username} · {user?.role}</span><LanguageSwitcher /><button onClick={() => void logout()} className="rounded border border-slate-700 px-2 py-1">{t("logout")}</button></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${loading ? "bg-amber-400" : backendOnline ? "bg-emerald-400" : "bg-red-400"}`} />
            <span className="text-sm font-medium">
              {sidebarConnectionLabel(loading, backendOnline, locale)}
            </span>
          </div>
          <p className="text-xs leading-5 text-slate-400">
            {t("sidebarDescription")}
          </p>
        </div>
      </div>
    </aside>
  );
}
