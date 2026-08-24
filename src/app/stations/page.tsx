"use client";

import { FormEvent, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useMockDelivery } from "@/context/MockDeliveryContext";

export default function StationsPage() {
  const { stations, addStation, removeStation } = useMockDelivery();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [yaw, setYaw] = useState("0");
  const [message, setMessage] = useState("");

  function handleAddStation(event: FormEvent) {
    event.preventDefault();
    const parsedX = Number(x);
    const parsedY = Number(y);
    const parsedYaw = Number(yaw);

    if (!name.trim() || !Number.isFinite(parsedX) || !Number.isFinite(parsedY) || !Number.isFinite(parsedYaw)) {
      setMessage("Enter a valid station name and numeric pose.");
      return;
    }

    const created = addStation({
      name: name.trim(),
      description: description.trim() || "Mock station",
      x: parsedX,
      y: parsedY,
      yaw: parsedYaw
    });

    setMessage(`${created.name} (${created.id}) added and is now available on Create Delivery.`);
    setName("");
    setDescription("");
    setX("0");
    setY("0");
    setYaw("0");
  }

  function handleRemove(id: string) {
    const result = removeStation(id);
    setMessage(result.message);
  }

  return (
    <>
      <PageHeader title="Station Management" description="Create and manage mock map goals shared across the whole UI." />

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

                <button type="button" onClick={() => handleRemove(station.id)} className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Remove</button>
              </div>
            ))}
          </div>
        </section>

        <form onSubmit={handleAddStation} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">Add Mock Station</h2>
          <p className="mt-1 text-sm text-slate-500">Stored in browser localStorage for Phase 1.1.</p>

          <div className="mt-5 grid gap-4">
            <Input label="Station name" value={name} onChange={setName} />
            <Input label="Description" value={description} onChange={setDescription} />
            <div className="grid grid-cols-3 gap-3">
              <Input label="X" value={x} onChange={setX} inputMode="decimal" />
              <Input label="Y" value={y} onChange={setY} inputMode="decimal" />
              <Input label="Yaw" value={yaw} onChange={setYaw} inputMode="decimal" />
            </div>

            <button type="submit" className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700">Add Station</button>

            <div aria-live="polite">
              {message && <p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">{message}</p>}
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
