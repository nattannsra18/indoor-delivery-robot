"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard", icon: "▦" },
  { href: "/delivery", label: "Create Delivery", icon: "＋" },
  { href: "/tasks", label: "Task Queue", icon: "≡" },
  { href: "/stations", label: "Stations", icon: "⌖" },
  { href: "/robots", label: "Robot Status", icon: "◉" }
];

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="border-b border-slate-200 bg-slate-950 text-white lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:border-slate-800">
      <div className="flex items-center gap-3 px-5 py-5">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-600 font-bold">R</div>
        <div className="min-w-0">
          <p className="truncate font-semibold">Delivery Robot</p>
          <p className="text-xs text-slate-400">Control Center</p>
        </div>
      </div>

      <nav className="flex gap-2 overflow-x-auto px-3 pb-4 lg:block lg:space-y-1 lg:overflow-visible">
        {navItems.map((item) => {
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-max items-center gap-3 rounded-xl px-4 py-3 text-sm transition ${active ? "bg-blue-600 font-medium text-white" : "text-slate-300 hover:bg-slate-900 hover:text-white"}`}
            >
              <span className="w-5 text-center text-base">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="hidden px-5 py-6 lg:block">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium">Mock Mode</span>
          </div>
          <p className="text-xs leading-5 text-slate-400">Phase 1 uses local mock data. No backend or MQTT is connected yet.</p>
        </div>
      </div>
    </aside>
  );
}
