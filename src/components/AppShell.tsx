"use client";

import { ReactNode } from "react";
import Sidebar from "@/components/Sidebar";
import { ApiDeliveryProvider, useDeliveryApi } from "@/context/ApiDeliveryContext";
import { API_BASE_URL } from "@/lib/api";

export default function AppShell({ children }: { children: ReactNode }) {
  return (
    <ApiDeliveryProvider>
      <ShellContent>{children}</ShellContent>
    </ApiDeliveryProvider>
  );
}

function ShellContent({ children }: { children: ReactNode }) {
  const { backendOnline, error, loading, refreshAll } = useDeliveryApi();

  return (
    <div className="min-h-screen lg:flex">
      <Sidebar />
      <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
        {!loading && !backendOnline && (
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">FastAPI backend is offline</p>
              <p className="mt-1 text-xs leading-5">
                Start the backend at {API_BASE_URL}. {error ? `Error: ${error}` : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshAll()}
              className="min-h-10 rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white"
            >
              Retry connection
            </button>
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
