"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import { useMockDelivery } from "@/context/MockDeliveryContext";

export default function CreateDeliveryPage() {
  const router = useRouter();
  const { stations, createTask, robot } = useMockDelivery();
  const [pickup, setPickup] = useState(stations[0]?.id ?? "");
  const [destination, setDestination] = useState(stations[2]?.id ?? stations[1]?.id ?? "");
  const [message, setMessage] = useState("");

  const valid = Boolean(pickup && destination && pickup !== destination);
  const pickupStation = useMemo(
    () => stations.find((station) => station.id === pickup),
    [pickup, stations]
  );
  const destinationStation = useMemo(
    () => stations.find((station) => station.id === destination),
    [destination, stations]
  );

  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!valid) {
      setMessage("Pickup and destination stations must be different.");
      return;
    }

    const created = createTask(pickup, destination);
    const autoAssigned = created.status === "GOING_TO_PICKUP";
    setMessage(
      `${created.id} created: ${pickupStation?.name} → ${destinationStation?.name}. ${
        autoAssigned ? "Robot was IDLE, so the mock scheduler assigned it immediately." : "Task was added to the queue."
      }`
    );
  }

  return (
    <>
      <PageHeader
        title="Create Delivery"
        description="Create a delivery and immediately see it on Dashboard and Task Queue."
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Delivery Request</h2>
              <p className="mt-1 text-sm text-slate-500">Select where SCUTTLE should collect and deliver the package.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${robot.state === "IDLE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              Robot: {robot.state.replaceAll("_", " ")}
            </span>
          </div>

          <div className="mt-7 grid gap-5">
            <Field label="Pickup Station">
              <select value={pickup} onChange={(event) => setPickup(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2">
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            <Field label="Destination Station">
              <select value={destination} onChange={(event) => setDestination(event.target.value)} className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2">
                {stations.map((station) => (
                  <option key={station.id} value={station.id}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            {!valid && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">Pickup and destination cannot be the same station.</div>}

            <button type="submit" disabled={!valid} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              Create Delivery Task
            </button>

            <div aria-live="polite">
              {message && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
                  {message}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => router.push("/")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Open Dashboard</button>
                    <button type="button" onClick={() => router.push("/tasks")} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold">Open Task Queue</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </form>

        <aside className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <h2 className="text-lg font-semibold text-slate-900">Task Preview</h2>
          <div className="mt-6 space-y-4">
            <PreviewCard title="Pickup" station={pickupStation?.name ?? "-"} detail={`x=${pickupStation?.x ?? "-"}, y=${pickupStation?.y ?? "-"}, yaw=${pickupStation?.yaw ?? "-"}`} />
            <div className="flex justify-center text-2xl text-blue-500">↓</div>
            <PreviewCard title="Destination" station={destinationStation?.name ?? "-"} detail={`x=${destinationStation?.x ?? "-"}, y=${destinationStation?.y ?? "-"}, yaw=${destinationStation?.yaw ?? "-"}`} />
          </div>

          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            <strong>Phase 1.1 behavior:</strong> if the robot is IDLE, the mock scheduler immediately changes the new task to GOING_TO_PICKUP. If the robot is busy, the task stays QUEUED.
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function PreviewCard({ title, station, detail }: { title: string; station: string; detail: string }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 font-semibold text-slate-900">{station}</p>
      <p className="mt-1 text-xs text-slate-500">{detail}</p>
    </div>
  );
}
