"use client";

import { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import { MockDeliveryProvider } from "@/context/MockDeliveryContext";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <MockDeliveryProvider>
      <div className="min-h-screen lg:flex">
        <Sidebar />
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </MockDeliveryProvider>
  );
}
