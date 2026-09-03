"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import RobotMap, { StationSelectionMode } from "@/components/RobotMap";
import { PriorityBadge } from "@/components/TaskMetadata";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { allowedPriority, taskCreationAction } from "@/lib/taskCreation";
import { Station, TaskPriority } from "@/types";

const RECIPIENT_MAX_LENGTH = 100;
const NOTE_MAX_LENGTH = 500;
const inputClassName = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2 disabled:bg-slate-100";

export default function CreateDeliveryPage() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    stations, createTask, robot, backendOnline, loading, occupancyMap, emergencyStop
  } = useDeliveryApi();
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [message, setMessage] = useState("");
  const [createdTaskId, setCreatedTaskId] = useState<string>();
  const [isError, setIsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [selectionMode, setSelectionMode] = useState<StationSelectionMode>("pickup");

  useEffect(() => {
    if (!stations.length) return;
    setPickup((current) => current || stations[0]?.id || "");
    setDestination((current) => current || stations[2]?.id || stations[1]?.id || "");
  }, [stations]);

  useEffect(() => {
    if (user?.role !== "ADMIN") setPriority("NORMAL");
  }, [user?.role]);

  const valid = Boolean(
    pickup && destination && pickup !== destination && backendOnline
    && !emergencyStop?.latched
    && recipientName.length <= RECIPIENT_MAX_LENGTH
    && deliveryNote.length <= NOTE_MAX_LENGTH
  );
  const pickupStation = useMemo(
    () => stations.find((station) => station.id === pickup),
    [pickup, stations]
  );
  const destinationStation = useMemo(
    () => stations.find((station) => station.id === destination),
    [destination, stations]
  );

  function invalidateReview() {
    setReviewing(false);
    setCreatedTaskId(undefined);
    setMessage("");
  }

  function selectStation(station: Station) {
    const conflicts = selectionMode === "pickup"
      ? station.id === destination
      : station.id === pickup;
    if (conflicts) {
      setIsError(true);
      setMessage("Pickup and destination cannot be the same station.");
      return;
    }
    invalidateReview();
    if (selectionMode === "pickup") setPickup(station.id);
    else setDestination(station.id);
    setIsError(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const action = taskCreationAction(valid, reviewing, submitting);
    if (action === "invalid") {
      setIsError(true);
      setMessage(backendOnline
        ? "Complete the form and choose different pickup and destination stations."
        : "FastAPI backend is not connected.");
      return;
    }
    if (action === "review") {
      setReviewing(true);
      setIsError(false);
      setMessage("Review the request summary, then confirm to create the task.");
      return;
    }

    setSubmitting(true);
    setMessage("");
    setIsError(false);
    try {
      const created = await createTask({
        pickupStationId: pickup,
        destinationStationId: destination,
        priority: allowedPriority(user?.role, priority),
        recipientName,
        deliveryNote
      });
      setCreatedTaskId(created.id);
      setReviewing(false);
      setMessage(`${created.id} created successfully. ${
        created.status === "GOING_TO_PICKUP"
          ? "The robot was available and accepted the task."
          : "The task was added to the priority queue."
      }`);
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
        description="Choose stations, add delivery details and review the request before it is sent to FastAPI."
      />

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">Select Stations on Map</h2>
            <p className="text-sm text-slate-500">Map clicks select predefined markers only and never send a navigation command.</p>
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
                    ? mode === "pickup" ? "bg-cyan-600 text-white" : "bg-violet-600 text-white"
                    : "text-slate-600 hover:bg-white"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                Select {mode}
              </button>
            ))}
          </fieldset>
        </div>
        {!backendOnline && !loading && <Notice tone="error">FastAPI is offline. Station controls are disabled until it reconnects.</Notice>}
        {emergencyStop?.latched && <Notice tone="error">New motion is disabled while Emergency Stop is latched.</Notice>}
        {!occupancyMap && backendOnline && <Notice tone="warning">The ROS map is unavailable. Use the station dropdowns below.</Notice>}
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
              <p className="mt-1 text-sm text-slate-500">Add the recipient and instructions needed at handoff.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              backendOnline && robot.state === "IDLE"
                ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>Robot: {robot.state.replaceAll("_", " ")}</span>
          </div>

          <div className="mt-7 grid gap-5">
            <Field label="Pickup Station">
              <select value={pickup} onChange={(event) => {
                invalidateReview(); setPickup(event.target.value); setSelectionMode("pickup");
              }} disabled={!backendOnline || stations.length === 0} className={inputClassName}>
                {stations.map((station) => (
                  <option key={station.id} value={station.id} disabled={station.id === destination}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            <Field label="Destination Station">
              <select value={destination} onChange={(event) => {
                invalidateReview(); setDestination(event.target.value); setSelectionMode("destination");
              }} disabled={!backendOnline || stations.length === 0} className={inputClassName}>
                {stations.map((station) => (
                  <option key={station.id} value={station.id} disabled={station.id === pickup}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            <Field label="Recipient name (optional)">
              <input value={recipientName} onChange={(event) => {
                invalidateReview(); setRecipientName(event.target.value);
              }} maxLength={RECIPIENT_MAX_LENGTH} placeholder="Name of the person receiving the delivery" className={inputClassName} />
              <CharacterCount current={recipientName.length} maximum={RECIPIENT_MAX_LENGTH} />
            </Field>

            <Field label="Delivery note (optional)">
              <textarea value={deliveryNote} onChange={(event) => {
                invalidateReview(); setDeliveryNote(event.target.value);
              }} maxLength={NOTE_MAX_LENGTH} rows={4} placeholder="Handling or handoff instructions" className={inputClassName} />
              <CharacterCount current={deliveryNote.length} maximum={NOTE_MAX_LENGTH} />
            </Field>

            {user?.role === "ADMIN" ? (
              <Field label="Priority">
                <select value={priority} onChange={(event) => {
                  invalidateReview(); setPriority(event.target.value as TaskPriority);
                }} className={inputClassName}>
                  <option value="NORMAL">Normal</option>
                  <option value="HIGH">High — queued before normal tasks</option>
                </select>
              </Field>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">Priority</p>
                <div className="mt-2"><PriorityBadge priority="NORMAL" /></div>
                <p className="mt-2 text-xs text-slate-500">Only administrators can create high-priority tasks.</p>
              </div>
            )}

            {pickup && destination && pickup === destination && <Notice tone="error">Pickup and destination cannot be the same station.</Notice>}

            <button type="submit" disabled={!valid || submitting} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {submitting ? "Creating task..." : reviewing ? "Confirm & Create Delivery" : "Review Delivery Request"}
            </button>

            <div aria-live="polite">
              {message && (
                <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
                  isError ? "border-red-100 bg-red-50 text-red-800"
                    : createdTaskId ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                      : "border-blue-100 bg-blue-50 text-blue-800"
                }`}>
                  {createdTaskId && <p className="text-base font-bold">Task ID: {createdTaskId}</p>}
                  <p>{message}</p>
                  {createdTaskId && (
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

        <aside className={`rounded-2xl border bg-white p-5 shadow-sm md:p-7 ${reviewing ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"}`}>
          <h2 className="text-lg font-semibold text-slate-900">{reviewing ? "Review Summary" : "Task Preview"}</h2>
          <p className="mt-1 text-sm text-slate-500">{reviewing
            ? "Confirm that these details are correct before creating the task."
            : "Complete the request to prepare a review summary."}</p>
          <div className="mt-6 space-y-4">
            <PreviewCard title="Pickup" value={pickupStation?.name ?? "-"} />
            <div className="flex justify-center text-2xl text-blue-500">↓</div>
            <PreviewCard title="Destination" value={destinationStation?.name ?? "-"} />
            <PreviewCard title="Recipient" value={recipientName.trim() || "Not specified"} />
            <PreviewCard title="Delivery note" value={deliveryNote.trim() || "No note"} preserveWhitespace />
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Priority</p>
              <PriorityBadge priority={priority} />
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            High priority changes only the order of queued tasks. It never interrupts an active delivery.
          </div>
        </aside>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function CharacterCount({ current, maximum }: { current: number; maximum: number }) {
  return <span className="text-right text-xs text-slate-400">{current}/{maximum}</span>;
}

function PreviewCard({ title, value, preserveWhitespace = false }: { title: string; value: string; preserveWhitespace?: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className={`mt-1 break-words font-semibold text-slate-900 ${preserveWhitespace ? "whitespace-pre-wrap" : ""}`}>{value}</p>
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "error" | "warning" }) {
  return <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
    tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-amber-100 bg-amber-50 text-amber-800"
  }`}>{children}</div>;
}
