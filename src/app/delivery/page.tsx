"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import RobotMap, { StationSelectionMode } from "@/components/RobotMap";
import { PriorityBadge } from "@/components/TaskMetadata";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { allowedPriority, taskCreationAction } from "@/lib/taskCreation";
import {
  formatPreviewDuration,
  routePreviewIsFresh
} from "@/lib/routePreview";
import { Station, TaskPriority, TaskRoutePreview } from "@/types";
import { useLocale } from "@/context/LocaleContext";
import { deliveryText } from "@/lib/i18n";

const RECIPIENT_MAX_LENGTH = 100;
const NOTE_MAX_LENGTH = 500;
const inputClassName = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none ring-blue-500 transition focus:ring-2 disabled:bg-slate-100";

export default function CreateDeliveryPage() {
  const { locale, format, t } = useLocale();
  const copy = deliveryText[locale];
  const router = useRouter();
  const { user } = useAuth();
  const {
    stations, createTask, previewTaskRoute, robot, backendOnline, loading,
    occupancyMap, emergencyStop
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
  const [previewing, setPreviewing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [routePreview, setRoutePreview] = useState<TaskRoutePreview>();
  const [selectionMode, setSelectionMode] = useState<StationSelectionMode>("pickup");

  useEffect(() => {
    if (!stations.length) return;
    setPickup((current) => current || stations[0]?.id || "");
    setDestination((current) => current || stations[2]?.id || stations[1]?.id || "");
  }, [stations]);

  useEffect(() => {
    if (user?.role !== "ADMIN") setPriority("NORMAL");
  }, [user?.role]);

  useEffect(() => {
    if (
      routePreview
      && occupancyMap
      && routePreview.mapRevision !== occupancyMap.revision
    ) {
      setRoutePreview(undefined);
      setReviewing(false);
      setIsError(true);
      setMessage(copy.mapChanged);
    }
  }, [occupancyMap, routePreview]);

  const valid = Boolean(
    pickup && destination && pickup !== destination && backendOnline
    && occupancyMap
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
    setRoutePreview(undefined);
    setCreatedTaskId(undefined);
    setMessage("");
  }

  function selectStation(station: Station) {
    const conflicts = selectionMode === "pickup"
      ? station.id === destination
      : station.id === pickup;
    if (conflicts) {
      setIsError(true);
      setMessage(copy.sameStation);
      return;
    }
    invalidateReview();
    if (selectionMode === "pickup") setPickup(station.id);
    else setDestination(station.id);
    setIsError(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const action = taskCreationAction(
      valid,
      reviewing,
      submitting || previewing
    );
    if (action === "invalid") {
      setIsError(true);
      setMessage(backendOnline
        ? copy.completeForm : copy.backendDisconnected);
      return;
    }
    if (action === "review") {
      setPreviewing(true);
      setIsError(false);
      setMessage(copy.validatingRoutes);
      try {
        const preview = await previewTaskRoute({
          pickupStationId: pickup,
          destinationStationId: destination,
          priority: allowedPriority(user?.role, priority)
        });
        setRoutePreview(preview);
        setReviewing(true);
        setMessage(copy.routesValidated);
      } catch (err) {
        setRoutePreview(undefined);
        setReviewing(false);
        setIsError(true);
        setMessage(err instanceof Error ? err.message : copy.routeUnavailable);
      } finally {
        setPreviewing(false);
      }
      return;
    }

    if (!routePreview || !routePreviewIsFresh(routePreview.expiresAt)) {
      setRoutePreview(undefined);
      setReviewing(false);
      setIsError(true);
      setMessage(copy.routePreviewExpired);
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
        deliveryNote,
        previewId: routePreview.previewId
      });
      setCreatedTaskId(created.id);
      setReviewing(false);
      setMessage(format(copy.taskId, { id: created.id }));
    } catch (err) {
      setRoutePreview(undefined);
      setReviewing(false);
      setIsError(true);
      setMessage(`${
        err instanceof Error ? err.message : copy.createUnavailable
      } ${copy.retryValidation}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={copy.createDelivery}
        description={copy.deliveryDescription}
      />

      <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-slate-900">{copy.selectStations}</h2>
            <p className="text-sm text-slate-500">{copy.mapSelectionHelp}</p>
          </div>
          <fieldset className="flex rounded-xl border border-slate-200 bg-slate-50 p-1">
            <legend className="sr-only">{copy.mapSelectionMode}</legend>
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
                {mode === "pickup" ? copy.pickup : copy.destination}
              </button>
            ))}
          </fieldset>
        </div>
        {!backendOnline && !loading && <Notice tone="error">{copy.stationControlsOffline}</Notice>}
        {emergencyStop?.latched && <Notice tone="error">{copy.motionDisabled}</Notice>}
        {!occupancyMap && backendOnline && (
          <Notice tone="warning">
            {copy.mapUnavailable}
          </Notice>
        )}
        <RobotMap
          interactive={backendOnline && stations.length > 0}
          selectedPickupStationId={pickup}
          selectedDestinationStationId={destination}
          selectionMode={selectionMode}
          onStationSelect={selectStation}
          routePreview={routePreview}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{copy.deliveryRequest}</h2>
              <p className="mt-1 text-sm text-slate-500">{copy.deliveryRequestHelp}</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              backendOnline && robot.state === "IDLE"
                ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
            }`}>Robot: {robot.state.replaceAll("_", " ")}</span>
          </div>

          <div className="mt-7 grid gap-5">
            <Field label={copy.pickupStation}>
              <select value={pickup} onChange={(event) => {
                invalidateReview(); setPickup(event.target.value); setSelectionMode("pickup");
              }} disabled={!backendOnline || stations.length === 0} className={inputClassName}>
                {stations.map((station) => (
                  <option key={station.id} value={station.id} disabled={station.id === destination}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            <Field label={copy.destinationStation}>
              <select value={destination} onChange={(event) => {
                invalidateReview(); setDestination(event.target.value); setSelectionMode("destination");
              }} disabled={!backendOnline || stations.length === 0} className={inputClassName}>
                {stations.map((station) => (
                  <option key={station.id} value={station.id} disabled={station.id === pickup}>{station.name} — {station.description}</option>
                ))}
              </select>
            </Field>

            <Field label={copy.recipientName}>
              <input value={recipientName} onChange={(event) => {
                invalidateReview(); setRecipientName(event.target.value);
              }} maxLength={RECIPIENT_MAX_LENGTH} placeholder={copy.recipientPlaceholder} className={inputClassName} />
              <CharacterCount current={recipientName.length} maximum={RECIPIENT_MAX_LENGTH} />
            </Field>

            <Field label={copy.deliveryNote}>
              <textarea value={deliveryNote} onChange={(event) => {
                invalidateReview(); setDeliveryNote(event.target.value);
              }} maxLength={NOTE_MAX_LENGTH} rows={4} placeholder={copy.notePlaceholder} className={inputClassName} />
              <CharacterCount current={deliveryNote.length} maximum={NOTE_MAX_LENGTH} />
            </Field>

            {user?.role === "ADMIN" ? (
              <Field label={copy.priority}>
                <select value={priority} onChange={(event) => {
                  invalidateReview(); setPriority(event.target.value as TaskPriority);
                }} className={inputClassName}>
                  <option value="NORMAL">{copy.normalPriority}</option>
                  <option value="HIGH">{copy.highPriority}</option>
                </select>
              </Field>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-700">{copy.priority}</p>
                <div className="mt-2"><PriorityBadge priority="NORMAL" /></div>
                <p className="mt-2 text-xs text-slate-500">{copy.priorityAdminOnly}</p>
              </div>
            )}

            {pickup && destination && pickup === destination && <Notice tone="error">{copy.sameStation}</Notice>}

            <button type="submit" disabled={!valid || submitting || previewing} className="min-h-11 rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {submitting ? copy.creating : previewing ? copy.validating : reviewing ? copy.confirmCreate : copy.review}
            </button>

            <div aria-live="polite">
              {message && (
                <div className={`rounded-xl border px-4 py-3 text-sm leading-6 ${
                  isError ? "border-red-100 bg-red-50 text-red-800"
                    : createdTaskId ? "border-emerald-100 bg-emerald-50 text-emerald-800"
                      : "border-blue-100 bg-blue-50 text-blue-800"
                }`}>
                  {createdTaskId && <p className="text-base font-bold">{format(copy.taskId, { id: createdTaskId })}</p>}
                  <p>{message}</p>
                  {createdTaskId && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => router.push("/")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white">{t("dashboard")}</button>
                      <button type="button" onClick={() => router.push("/tasks")} className="rounded-lg border border-emerald-300 px-3 py-2 text-xs font-semibold">{copy.openTaskQueue}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </form>

        <aside className={`rounded-2xl border bg-white p-5 shadow-sm md:p-7 ${reviewing ? "border-blue-300 ring-2 ring-blue-100" : "border-slate-200"}`}>
          <h2 className="text-lg font-semibold text-slate-900">{reviewing ? copy.validatedReview : copy.taskPreview}</h2>
          <p className="mt-1 text-sm text-slate-500">{reviewing
            ? copy.reviewHelp : copy.previewHelp}</p>
          <div className="mt-6 space-y-4">
            <PreviewCard title={copy.pickup} value={pickupStation?.name ?? "-"} />
            <div className="flex justify-center text-2xl text-blue-500">↓</div>
            <PreviewCard title={copy.destination} value={destinationStation?.name ?? "-"} />
            <PreviewCard title={copy.recipient} value={recipientName.trim() || copy.notSpecified} />
            <PreviewCard title={copy.deliveryNote} value={deliveryNote.trim() || copy.noNote} preserveWhitespace />
            {routePreview && (
              <div className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                <p className="font-bold">{copy.routeReachable}</p>
                <PreviewMetric label={copy.robotToPickup} distance={routePreview.pickupDistanceMeters} seconds={routePreview.pickupEtaSeconds} />
                <PreviewMetric label={copy.pickupToDestination} distance={routePreview.deliveryDistanceMeters} seconds={routePreview.destinationEtaSeconds - routePreview.pickupEtaSeconds - 10} />
                <PreviewMetric label={copy.totalRoute} distance={routePreview.totalDistanceMeters} seconds={routePreview.completionEtaSeconds} />
                <p className="text-xs text-emerald-700">{copy.completionAllowance}</p>
              </div>
            )}
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{copy.priority}</p>
              <PriorityBadge priority={priority} />
            </div>
          </div>
          <div className="mt-6 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {copy.priorityQueueHelp}
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

function PreviewMetric({ label, distance, seconds }: {
  label: string; distance: number; seconds: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="font-semibold">{distance.toFixed(1)} m · {formatPreviewDuration(seconds)}</span>
    </div>
  );
}

function Notice({ children, tone }: { children: ReactNode; tone: "error" | "warning" }) {
  return <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${
    tone === "error" ? "border-red-100 bg-red-50 text-red-700" : "border-amber-100 bg-amber-50 text-amber-800"
  }`}>{children}</div>;
}
