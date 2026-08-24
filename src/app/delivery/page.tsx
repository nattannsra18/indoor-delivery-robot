"use client";

import { FormEvent, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { stations } from "@/lib/mock-data";

export default function CreateDeliveryPage() {
  const [pickup, setPickup] = useState("A");
  const [destination, setDestination] = useState("C");
  const [message, setMessage] = useState("");
  const valid = pickup !== destination;
  const pickupStation = useMemo(() => stations.find((s) => s.id === pickup), [pickup]);
  const destinationStation = useMemo(() => stations.find((s) => s.id === destination), [destination]);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!valid) {
      setMessage("Pickup and destination stations must be different.");
      return;
    }
    const taskId = `TASK-${Math.floor(100 + Math.random() * 900)}`;
    setMessage(`${taskId} created in Mock Mode: ${pickupStation?.name} → ${destinationStation?.name}`);
  }

  return (
    <>
      <PageHeader title="Create Delivery" description="Create a mock delivery request before connecting the real backend." />
      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <h2 className="text-lg font-semibold text-slate-900">Delivery Request</h2>
          <p className="mt-1 text-sm text-slate-500">Select where the robot should collect and deliver the package.</p>
          <div className="mt-7 grid gap-5">
            <Field label="Pickup Station">
              <select value={pickup} onChange={(e) => setPickup(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2">
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.description}</option>)}
              </select>
            </Field>
            <Field label="Destination Station">
              <select value={destination} onChange={(e) => setDestination(e.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2">
                {stations.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.description}</option>)}
              </select>
            </Field>
            {!valid && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">Pickup and destination cannot be the same station.</div>}
            <button type="submit" disabled={!valid} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">Create Delivery Task</button>
            <div aria-live="polite">{message && <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}</div>
          </div>
        </form>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <h2 className="text-lg font-semibold text-slate-900">Task Preview</h2>
          <div className="mt-6 space-y-4">
            <PreviewCard title="Pickup" station={pickupStation?.name ?? "-"} detail={`x=${pickupStation?.x ?? "-"}, y=${pickupStation?.y ?? "-"}, yaw=${pickupStation?.yaw ?? "-"}`} />
            <div className="flex justify-center text-2xl text-blue-500">↓</div>
            <PreviewCard title="Destination" station={destinationStation?.name ?? "-"} detail={`x=${destinationStation?.x ?? "-"}, y=${destinationStation?.y ?? "-"}, yaw=${destinationStation?.yaw ?? "-"}`} />
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">In Phase 2, this form will call FastAPI. The backend will validate the request, create a database record, and place the delivery in the task queue.</div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, children }: { label:string; children:React.ReactNode }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function PreviewCard({ title, station, detail }: { title:string; station:string; detail:string }) {
  return <div className="rounded-xl border border-slate-200 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p><p className="mt-1 font-semibold text-slate-900">{station}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>;
}
