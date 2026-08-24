"use client";

import { FormEvent, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";

export default function StationsPage() {
  const { stations, addStation, removeStation, backendOnline } = useDeliveryApi();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [yaw, setYaw] = useState("0");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleAddStation(event: FormEvent) {
    event.preventDefault();
    const parsedX = Number(x);
    const parsedY = Number(y);
    const parsedYaw = Number(yaw);

    if (!name.trim() || !Number.isFinite(parsedX) || !Number.isFinite(parsedY) || !Number.isFinite(parsedYaw)) {
      setIsError(true);
      setMessage("Enter a valid station name and numeric pose.");
      return;
    }

    setBusy(true);
    setMessage("");
    setIsError(false);
    try {
      const created = await addStation({
        name: name.trim(),
        description: description.trim() || "Delivery station",
        x: parsedX,
        y: parsedY,
        yaw: parsedYaw
      });

      setMessage(`${created.name} (${created.id}) added through FastAPI and is now available on Create Delivery.`);
      setName("");
      setDescription("");
      setX("0");
      setY("0");
      setYaw("0");
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Unable to add station.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setMessage("");
    const result = await removeStation(id);
    setIsError(!result.ok);
    setMessage(result.message);
    setBusy(false);
  }

  return (
    <>
      <PageHeader title="Station Management" description="Create and manage map goals through the FastAPI backend." />

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Configured Stations</h2>
          <div className="mt-4 grid gap-3">
            {stations.map((station) => (
              <div key={station.id} className="flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">{station.id}</span>
                    <div>
                      <p className="font-semibold text-slate-900">{station.name}</p>
                      <p className="text-xs text-slate-500">{station.description}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">Pose: x={station.x.toFixed(2)}, y={station.y.toFixed(2)}, yaw={station.yaw.toFixed(2)}</p>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRemove(station.id)}
                  disabled={busy || !backendOnline}
                  className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
            {stations.length === 0 && <p className="py-6 text-sm text-slate-500">No stations loaded from FastAPI.</p>}
          </div>
        </section>

        <form onSubmit={handleAddStation} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Add Station</h2>
          <p className="mt-1 text-sm text-slate-500">Phase 2.1 stores this in FastAPI memory. PostgreSQL comes in Phase 3.</p>

          <div className="mt-5 grid gap-4">
            <Input label="Station name" value={name} onChange={setName} />
            <Input label="Description" value={description} onChange={setDescription} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="X" value={x} onChange={setX} inputMode="decimal" />
              <Input label="Y" value={y} onChange={setY} inputMode="decimal" />
              <Input label="Yaw" value={yaw} onChange={setYaw} inputMode="decimal" />
            </div>

            <button
              type="submit"
              disabled={busy || !backendOnline}
              className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {busy ? "Saving..." : "Add Station via FastAPI"}
            </button>

            <div aria-live="polite">
              {message && <p className={`rounded-xl p-3 text-sm leading-6 ${isError ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"}`}>{message}</p>}
            </div>
          </div>
        </form>
      </div>
    </>
  );
}

function Input({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "decimal" }) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-semibold text-slate-700">{label}</span>
      <input value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-xl border border-slate-300 px-3 py-3 outline-none ring-blue-500 transition focus:ring-2" />
    </label>
  );
}
