"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { navigationForRole } from "@/lib/roleDashboard";
import { LanguageSwitcher, useLocale } from "@/context/LocaleContext";
import { getNotifications } from "@/lib/api";
import { navigationLabel } from "@/lib/i18n";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const navItems = navigationForRole(user?.role ?? "USER");
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  useEffect(() => { let active = true; const refresh = () => { getNotifications(0, 1).then((page) => { if (active) setUnread(page.unreadCount); }).catch(() => {}); }; refresh(); window.addEventListener("idr:notification", refresh); return () => { active = false; window.removeEventListener("idr:notification", refresh); }; }, [pathname]);

  return (
    <aside className="border-b border-slate-200 bg-[#071126] text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:min-h-0 lg:w-64 lg:shrink-0 lg:self-start lg:flex-col lg:border-b-0 lg:border-r lg:border-slate-800">
      <div className="flex items-center justify-between gap-3 px-5 py-5">
        <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-950/40 shadow-md shadow-blue-950/30 ring-1 ring-white/10">
          <span aria-hidden="true" className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: "url('/auth/delivery-robot-mark.png')", backgroundSize: "290% auto" }} />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold">{t("appName")}</p>
          <p className="text-xs text-slate-400">{user?.role === "USER" ? (locale === "th" ? "พอร์ทัลผู้ใช้งาน" : "User Portal") : t("controlCenter")}</p>
        </div>
        </div>
        <button type="button" className="min-h-11 min-w-11 rounded border border-slate-700 lg:hidden" aria-label={t("openNavigation")} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((value) => !value)}>☰</button>
      </div>

      <nav id="primary-navigation" className={`${open ? "block" : "hidden"} px-3 pb-4 lg:block lg:min-h-0 lg:flex-1 lg:space-y-1 lg:overflow-y-auto`}>
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${active ? "bg-blue-600 font-semibold text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
            >
              <NavIcon href={item.href} />
              {item.href === "/" ? t("dashboard") : item.href === "/notifications" ? <>{t("notifications")}{unread > 0 && <span aria-label={`${unread} ${t("unread")} ${t("notifications").toLowerCase()}`} className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-blue-700">{unread > 99 ? "99+" : unread}</span>}</> : item.href === "/audit" ? t("audit") : navigationLabel(item.href, item.label, locale)}
            </Link>
          );
        })}
      </nav>

      <div className={`${open ? "flex" : "hidden"} items-center justify-between px-5 pb-4 lg:hidden`}><LanguageSwitcher /><button onClick={() => void logout()} className="min-h-10 rounded border border-slate-700 px-3 text-sm">{t("logout")}</button></div>

      <div className="hidden shrink-0 px-5 py-5 lg:block">
        <div className="space-y-4 border-t border-slate-800 pt-5">
          <div className="flex items-center gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sm font-bold">{user?.username.slice(0, 1).toUpperCase()}</span>
            <div className="min-w-0"><p className="truncate text-sm font-semibold">{user?.username}</p><p className="text-xs text-slate-400">{user?.role === "ADMIN" ? (locale === "th" ? "ผู้ดูแลระบบ" : "Administrator") : (locale === "th" ? "ผู้ใช้งาน" : "User")}</p></div>
          </div>
          <div className="flex items-center justify-between gap-2"><LanguageSwitcher /><button onClick={() => void logout()} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">↪ {t("logout")}</button></div>
        </div>
      </div>
    </aside>
  );
}

function NavIcon({ href }: { href: string }) {
  const common = "h-5 w-5 shrink-0";
  if (href === "/") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>;
  if (href === "/delivery") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>;
  if (href === "/tasks") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" /></svg>;
  if (href === "/stations") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>;
  if (href === "/users") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (href === "/notifications") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></svg>;
}
