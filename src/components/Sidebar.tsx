"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { navigationForRole } from "@/lib/roleDashboard";
import { LanguageSwitcher, useLocale } from "@/context/LocaleContext";
import { getNotifications } from "@/lib/api";
import { navigationLabel } from "@/lib/i18n";
import { setCachedNotificationPage } from "@/lib/notificationCache";

const COLLAPSED_KEY = "idr-sidebar-collapsed";

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const navItems = navigationForRole(user?.role ?? "USER");
  const { locale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);
  const sections = user?.role === "ADMIN" ? [
    { label: locale === "th" ? "การปฏิบัติงาน" : "OPERATIONS", items: navItems.filter((item) => ["/", "/delivery", "/tasks"].includes(item.href)) },
    { label: locale === "th" ? "ฝูงหุ่นยนต์" : "FLEET", items: navItems.filter((item) => ["/maps", "/stations", "/robots"].includes(item.href)) },
    { label: locale === "th" ? "ระบบ" : "SYSTEM", items: navItems.filter((item) => ["/diagnostics", "/users", "/notifications", "/audit"].includes(item.href)) },
  ] : [{ label: locale === "th" ? "การปฏิบัติงาน" : "OPERATIONS", items: navItems }];
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => { setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "true"); }, []);
  useEffect(() => { const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);
  useEffect(() => { let active = true; const refresh = () => { getNotifications(0, 30).then((page) => { if (active) { setUnread(page.unreadCount); if (user?.id) setCachedNotificationPage(user.id, "all", page); } }).catch(() => {}); }; refresh(); window.addEventListener("idr:notification", refresh); return () => { active = false; window.removeEventListener("idr:notification", refresh); }; }, [pathname, user?.id]);
  const toggleCollapsed = () => setCollapsed((current) => { const next = !current; localStorage.setItem(COLLAPSED_KEY, String(next)); return next; });

  return (
    <aside className={`border-b border-slate-200 bg-gradient-to-b from-[#172943] to-[#0b172a] text-white transition-[width] lg:sticky lg:top-0 lg:flex lg:h-screen lg:min-h-0 lg:shrink-0 lg:self-start lg:flex-col lg:border-b-0 lg:border-r lg:border-slate-800 ${collapsed ? "lg:w-20" : "lg:w-64"}`}>
      <div className={`flex items-center justify-between gap-3 px-5 py-5 ${collapsed ? "lg:flex-col lg:px-3" : ""}`}>
        <div className="flex items-center gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl bg-blue-950/40 shadow-md shadow-blue-950/30 ring-1 ring-white/10">
          <span aria-hidden="true" className="h-full w-full bg-center bg-no-repeat" style={{ backgroundImage: "url('/auth/delivery-robot-mark.png')", backgroundSize: "290% auto" }} />
        </div>
        <div className={`min-w-0 ${collapsed ? "lg:hidden" : ""}`}>
          <p className="truncate font-semibold">{t("appName")}</p>
          <p className="text-xs text-slate-400">{user?.role === "USER" ? (locale === "th" ? "พอร์ทัลผู้ใช้งาน" : "User Portal") : t("controlCenter")}</p>
        </div>
        </div>
        <button type="button" className="hidden h-10 w-10 shrink-0 place-items-center rounded-lg border border-slate-700 text-xl text-slate-300 transition hover:border-slate-500 hover:bg-white/5 hover:text-white lg:grid" aria-label={collapsed ? t("expandNavigation") : t("collapseNavigation")} aria-pressed={collapsed} aria-controls="primary-navigation" onClick={toggleCollapsed}>{collapsed ? "›" : "‹"}</button>
        <button type="button" className="min-h-11 min-w-11 rounded border border-slate-700 lg:hidden" aria-label={t("openNavigation")} aria-expanded={open} aria-controls="primary-navigation" onClick={() => setOpen((value) => !value)}>☰</button>
      </div>

      <nav id="primary-navigation" className={`${open ? "block" : "hidden"} px-3 pb-4 lg:block lg:min-h-0 lg:flex-1 lg:overflow-y-auto ${collapsed ? "lg:px-2" : ""}`}>
        {sections.map((section) => <div key={section.label} className="mb-5">
          <p className={`px-3 pb-2 text-[10px] font-bold tracking-[0.14em] text-slate-400 ${collapsed ? "lg:sr-only" : ""}`}>{section.label}</p>
          <div className="space-y-1">{section.items.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const label = item.href === "/" ? t("dashboard") : item.href === "/notifications" ? t("notifications") : item.href === "/audit" ? t("audit") : navigationLabel(item.href, item.label, locale);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? label : undefined}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition ${collapsed ? "lg:justify-center lg:px-2" : ""} ${active ? "bg-blue-600 font-semibold text-white shadow-lg shadow-blue-950/30" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}
            >
              <NavIcon href={item.href} />
              <span className={collapsed ? "lg:sr-only" : ""}>{label}</span>
              {item.href === "/notifications" && unread > 0 && <span aria-label={`${unread} ${t("unread")} ${t("notifications").toLowerCase()}`} className={`ml-auto rounded-full bg-white px-2 py-0.5 text-xs text-blue-700 ${collapsed ? "lg:absolute lg:right-1 lg:top-1 lg:h-2 lg:w-2 lg:p-0 lg:text-[0px]" : ""}`}>{unread > 99 ? "99+" : unread}</span>}
            </Link>
          );
        })}</div></div>)}
      </nav>

      <div className={`${open ? "flex" : "hidden"} items-center justify-between px-5 pb-4 lg:hidden`}><LanguageSwitcher /><button onClick={() => void logout()} className="min-h-10 rounded-lg border border-rose-500/60 bg-rose-600 px-4 text-sm font-semibold text-white hover:bg-rose-500">{t("logout")}</button></div>

      <div className={`hidden shrink-0 py-5 lg:block ${collapsed ? "px-3" : "px-5"}`}>
        <div className="space-y-4 border-t border-slate-800 pt-5">
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`}>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sm font-bold">{user?.username.slice(0, 1).toUpperCase()}</span>
            <div className={`min-w-0 ${collapsed ? "hidden" : ""}`}><p className="truncate text-sm font-semibold">{user?.username}</p><p className="text-xs text-slate-400">{user?.role === "ADMIN" ? (locale === "th" ? "ผู้ดูแลระบบ" : "Administrator") : (locale === "th" ? "ผู้ใช้งาน" : "User")}</p></div>
          </div>
          {collapsed ? <button type="button" onClick={() => void logout()} aria-label={t("logout")} title={t("logout")} className="mx-auto grid h-10 w-10 place-items-center rounded-lg border border-rose-500/60 bg-rose-600 text-white shadow-sm shadow-rose-950/30 hover:bg-rose-500"><LogoutIcon /></button> : <div className="flex items-center justify-between gap-2"><LanguageSwitcher /><button onClick={() => void logout()} className="rounded-lg border border-rose-500/60 bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-rose-950/30 hover:bg-rose-500">{t("logout")}</button></div>}
        </div>
      </div>
    </aside>
  );
}

function LogoutIcon() {
  return <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M10 5H5v14h5M14 8l4 4-4 4M18 12H9" /></svg>;
}

function NavIcon({ href }: { href: string }) {
  const common = "h-5 w-5 shrink-0";
  if (href === "/") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg>;
  if (href === "/delivery") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 5v14M5 12h14" /></svg>;
  if (href === "/tasks") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01" strokeLinecap="round" /></svg>;
  if (href === "/stations") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z"/><circle cx="12" cy="10" r="2"/></svg>;
  if (href === "/maps") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3V6Z"/><path d="M8 3v15M16 6v15"/></svg>;
  if (href === "/robots") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="7" width="16" height="12" rx="3"/><path d="M9 12h.01M15 12h.01M9 16h6M12 7V4M9 4h6" strokeLinecap="round"/></svg>;
  if (href === "/diagnostics") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9"/><path d="M5 13h3l2-5 4 9 2-4h3" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (href === "/users") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M16 20v-1.5a4.5 4.5 0 0 0-4.5-4.5h-4A4.5 4.5 0 0 0 3 18.5V20M9.5 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM17 9l2 2 4-4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  if (href === "/notifications") return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg>;
  return <svg className={common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 3h12v18H6zM9 7h6M9 11h6M9 15h4"/></svg>;
}
