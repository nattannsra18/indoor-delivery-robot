"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import RobotMap, { StationSelectionMode } from "@/components/RobotMap";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { Station } from "@/types";

export default function CreateDeliveryPage() {
  const router = useRouter();
  const {
    stations, createTask, robot, backendOnline, loading, occupancyMap, emergencyStop
  } = useDeliveryApi();
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectionMode, setSelectionMode] =
    useState<StationSelectionMode>("pickup");

  useEffect(() => {
    if (!stations.length) return;
    setPickup((current) => current || stations[0]?.id || "");
    setDestination((current) => current || stations[2]?.id || stations[1]?.id || "");
  }, [stations]);

  const valid = Boolean(pickup && destination && pickup !== destination && backendOnline && !emergencyStop?.latched);
  const pickupStation = useMemo(
    () => stations.find((station) => station.id === pickup),
    [pickup, stations]
  );
  const destinationStation = useMemo(
    () => stations.find((station) => station.id === destination),
    [destination, stations]
  );

  function selectStation(station: Station) {
    const conflicts = selectionMode === "pickup"
      ? station.id === destination
      : station.id === pickup;
    if (conflicts) {
      setIsError(true);
      setMessage("Pickup and destination cannot be the same station.");
      return;
    }

    if (selectionMode === "pickup") {
      setPickup(station.id);
    } else {
      setDestination(station.id);
    }
    setIsError(false);
    setMessage(`${station.name} selected as ${selectionMode}. Submit the form to create the task.`);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (!valid) {
      setIsError(true);
      setMessage(backendOnline ? "Pickup and destination stations must be different." : "FastAPI backend is not connected.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setIsError(false);

    try {
      const created = await createTask(pickup, destination);
      const autoAssigned = created.status === "GOING_TO_PICKUP";
      setMessage(
        `${created.id} created by FastAPI: ${pickupStation?.name} → ${destinationStation?.name}. ${
          autoAssigned ? "Robot was IDLE, so FastAPI assigned it immediately." : "Robot is busy, so FastAPI added the task to the queue."
        }`
      );
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Unable to create delivery task.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Create Delivery"
        description="Choose predefined stations on the live map, then submit the validated delivery request to FastAPI."
      />

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Select Stations on Map</h2>
            <p className="text-sm text-slate-500">
              Map clicks select predefined markers only and never send a navigation command.
            </p>
          </div>
          <fieldset className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <legend className="sr-only">Map selection mode</legend>
            {(["pickup", "destination"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={selectionMode === mode}
                onClick={() => setSelectionMode(mode)}
                disabled={!backendOnline || stations.length === 0}
                className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition ${
                  selectionMode === mode
                    ? mode === "pickup"
                      ? "bg-cyan-600 text-white"
                      : "bg-violet-600 text-white"
                    : "text-slate-600 hover:bg-white"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Select {mode}
              </button>
            ))}
          </fieldset>
        </div>
        {!backendOnline && !loading && (
          <div className="mb-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            FastAPI is offline. Existing station controls are disabled until it reconnects.
          </div>
        )}
        {emergencyStop?.latched && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">New motion is disabled while Emergency Stop is latched.</div>}
        {!occupancyMap && backendOnline && (
          <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            The ROS map is not available. Use the station dropdowns below as a fallback.
          </div>
        )}
        <RobotMap
          interactive={backendOnline && stations.length > 0}
          selectedPickupStationId={pickup}
          selectedDestinationStationId={destination}
          selectionMode={selectionMode}
          onStationSelect={selectStation}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Delivery Request</h2>
              <p className="mt-1 text-sm text-slate-500">Select where SCUTTLE should collect and deliver the package.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${backendOnline && robot.state === "IDLE" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
              Robot: {robot.state.replaceAll("_", " ")}
            </span>
          </div>

          <div className="mt-7 grid gap-5">
            <Field label="Pickup Station">
              <select
                value={pickup}
                onChange={(event) => {
                  setPickup(event.target.value);
                  setSelectionMode("pickup");
                }}
                disabled={!backendOnline || stations.length === 0}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2 disabled:bg-slate-100"
              >
                {stations.map((station) => (
                  <option key={station.id} value={station.id} disabled={station.id === destination}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            <Field label="Destination Station">
              <select
                value={destination}
                onChange={(event) => {
                  setDestination(event.target.value);
                  setSelectionMode("destination");
                }}
                disabled={!backendOnline || stations.length === 0}
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2 disabled:bg-slate-100"
              >
                {stations.map((station) => (
                  <option key={station.id} value={station.id} disabled={station.id === pickup}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            {pickup && destination && pickup === destination && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">Pickup and destination cannot be the same station.</div>
            )}

            <button
              type="submit"
              disabled={!valid || submitting}
              className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {submitting ? "Sending to FastAPI..." : "Create Delivery Task"}
            </button>

            <div aria-live="polite">
              {message && (
                <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${isError ? "border-red-100 bg-red-50 text-red-800" : "border-emerald-100 bg-emerald-50 text-emerald-800"}`}>
                  {message}
                  {!isError && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => router.push("/")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">Open Dashboard</button>
                      <button type="button" onClick={() => router.push("/tasks")} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold">Open Task Queue</button>
                    </div>
                  )}
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
            FastAPI validates the selected stations, creates the
            delivery task and dispatches it through the ROS 2 Web
            Bridge when the robot is available.
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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
