"use client";

import { ReactNode, RefObject, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import RobotMap, { StationSelectionMode } from "@/components/RobotMap";
import { PriorityBadge } from "@/components/TaskMetadata";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { deliveryFlowText, deliveryText } from "@/lib/i18n";
import { routePreviewIsFresh } from "@/lib/routePreview";
import { allowedPriority } from "@/lib/taskCreation";
import { Station, TaskPriority, TaskRoutePreview } from "@/types";

const NOTE_MAX_LENGTH = 500;
const inputClass = "w-full min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
type ModalStep = "station" | "details" | "review" | "success" | null;
type SuccessSummary = { taskId: string; queuePosition: number; start?: number; completion?: number };

export default function CreateDeliveryPage() {
  const { locale } = useLocale();
  const copy = deliveryText[locale];
  const flow = deliveryFlowText[locale];
  const router = useRouter();
  const { user } = useAuth();
  const {
    stations, createTask, previewTaskRoute, robot, activeTask, backendOnline,
    loading, occupancyMap, mapMetadata, emergencyStop, globalQueuedCount,
    robotAvailableSeconds
  } = useDeliveryApi();
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [selectionMode, setSelectionMode] = useState<StationSelectionMode>("pickup");
  const [selectedStation, setSelectedStation] = useState<Station>();
  const [step, setStep] = useState<ModalStep>(null);
  const [preview, setPreview] = useState<TaskRoutePreview>();
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [success, setSuccess] = useState<SuccessSummary>();
  const continueRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (user?.role !== "ADMIN") setPriority("NORMAL");
  }, [user?.role]);

  const pickupStation = useMemo(() => stations.find((item) => item.id === pickup), [pickup, stations]);
  const destinationStation = useMemo(() => stations.find((item) => item.id === destination), [destination, stations]);
  const canPlan = Boolean(pickup && destination && pickup !== destination && backendOnline && occupancyMap && !emergencyStop?.latched);

  useEffect(() => {
    if (!canPlan) {
      setPreview(undefined); setPreviewError(""); setPreviewing(false); return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewing(true); setPreviewError(""); setPreview(undefined);
      try {
        const result = await previewTaskRoute({
          pickupStationId: pickup, destinationStationId: destination,
          priority: allowedPriority(user?.role, priority)
        });
        if (!cancelled) setPreview(result);
      } catch (error) {
        if (!cancelled) setPreviewError(error instanceof Error ? error.message : copy.routeUnavailable);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [canPlan, copy.routeUnavailable, destination, occupancyMap?.revision, pickup, previewAttempt, previewTaskRoute, priority, user?.role]);

  const busy = !backendOnline || !robot.online || robot.state !== "IDLE";
  const ahead = globalQueuedCount + (backendOnline && robot.online && robot.state !== "IDLE" ? 1 : 0);
  const start = busy ? robotAvailableSeconds : 0;
  const travel = preview?.travelTimeSeconds;
  const completion = preview && start !== undefined ? start + preview.completionEtaSeconds : undefined;
  const routeReady = Boolean(preview && routePreviewIsFresh(preview.expiresAt));
  const mapContext = mapMetadata
    ? [mapMetadata.building, mapMetadata.floor, mapMetadata.areaDescription]
        .filter(Boolean).join(" · ")
    : flow.mapContextPending;

  function chooseStation(mode: StationSelectionMode) {
    if (!selectedStation) return;
    if ((mode === "pickup" && selectedStation.id === destination) || (mode === "destination" && selectedStation.id === pickup)) return;
    if (mode === "pickup") setPickup(selectedStation.id); else setDestination(selectedStation.id);
    setSelectionMode(mode === "pickup" ? "destination" : "pickup");
    setStep(null);
  }

  async function submit() {
    if (!preview || !routePreviewIsFresh(preview.expiresAt)) {
      setSubmitError(flow.routeExpired); setStep(null); setPreviewAttempt((value) => value + 1); return;
    }
    setSubmitting(true); setSubmitError("");
    const queuePosition = !activeTask && robot.state === "IDLE" && globalQueuedCount === 0 ? 0 : globalQueuedCount + 1;
    try {
      const task = await createTask({
        pickupStationId: pickup, destinationStationId: destination,
        priority: allowedPriority(user?.role, priority), recipientName: recipient,
        deliveryNote: note, previewId: preview.previewId
      });
      setSuccess({ taskId: task.id, queuePosition, start, completion });
      setStep("success");
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : copy.createUnavailable);
      setPreview(undefined); setPreviewAttempt((value) => value + 1); setStep("review");
    } finally { setSubmitting(false); }
  }

  return <>
    <PageHeader title={copy.createDelivery} description={flow.pageDescription} />
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-1">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-slate-900">{mapMetadata?.mapName ?? flow.liveMap}</h2>
              <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700">{flow.liveMap}</span>
            </div>
            <p className="mt-0.5 text-sm font-medium text-slate-600">{mapContext}</p>
            <p className="mt-1 text-xs text-slate-400">{flow.mapHint}</p>
          </div>
          <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${robot.online && backendOnline ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
            ● {robot.online && backendOnline ? flow.robotOnline : flow.robotOffline}
          </span>
        </div>
        {!backendOnline && !loading && <Notice error>{copy.stationControlsOffline}</Notice>}
        {emergencyStop?.latched && <Notice error>{copy.motionDisabled}</Notice>}
        {!occupancyMap && backendOnline && <Notice>{copy.mapUnavailable}</Notice>}
        <RobotMap
          interactive={backendOnline && stations.length > 0}
          selectedPickupStationId={pickup}
          selectedDestinationStationId={destination}
          selectionMode={selectionMode}
          onStationSelect={(station) => { setSelectedStation(station); setStep("station"); }}
          routePreview={preview} smoothMotion showStationButtons={false}
          showTechnicalDetails={false}
        />
      </section>

      <aside className="space-y-4 xl:sticky xl:top-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className={`grid h-11 w-11 place-items-center rounded-2xl text-xl ${busy ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>◉</span>
            <div><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{flow.robotStatus}</p><p className="font-bold text-slate-900">{robotStateLabel(robot.state, locale)}</p>
              <p className="mt-0.5 text-sm text-slate-500">{busy ? flow.availableIn.replace("{time}", formatDuration(start, locale)) : flow.availableNow}</p></div>
          </div>
          <p className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{flow.deliveriesAhead.replace("{count}", String(ahead))}</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">{flow.selectedStations}</h2>
          <div className="mt-4 space-y-4">
            <StationSelect label={copy.pickup} value={pickup} stations={stations} disabledId={destination} placeholder={flow.choosePickup} onChange={(value) => { setPickup(value); setSelectionMode("pickup"); }} />
            <StationSelect green label={copy.destination} value={destination} stations={stations} disabledId={pickup} placeholder={flow.chooseDestination} onChange={(value) => { setDestination(value); setSelectionMode("destination"); }} />
          </div>
          <div className="mt-5 min-h-20" aria-live="polite">
            {previewing && <RouteState tone="loading" title={flow.checkingRoute} detail={flow.checkingRouteDetail} />}
            {!previewing && preview && <RouteState tone="success" title={flow.routeAvailable} detail={`${preview.totalDistanceMeters.toFixed(1)} m · ${formatDuration(travel, locale)}`} />}
            {!previewing && previewError && <><RouteState tone="error" title={flow.routeUnavailable} detail={previewError} /><button type="button" onClick={() => setPreviewAttempt((value) => value + 1)} className="mt-2 text-sm font-semibold text-blue-700 underline">{flow.tryAgain}</button></>}
            {!previewing && !preview && !previewError && <RouteState tone="idle" title={flow.selectTwoStations} detail={flow.routeWillAppear} />}
          </div>
          <div className="mt-5 rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <Metric label={flow.estimatedStart} value={formatDuration(start, locale)} />
            <Metric label={flow.estimatedCompletion} value={formatDuration(completion, locale)} top />
          </div>
          {submitError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</p>}
          <button ref={continueRef} type="button" disabled={!routeReady || previewing} onClick={() => { setSubmitError(""); setStep("details"); }} className="mt-5 min-h-12 w-full rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{flow.continue} →</button>
        </section>
      </aside>
    </div>

    <Modal open={step === "station" && Boolean(selectedStation)} title={flow.selectStation} closeLabel={flow.closeModal} onClose={() => setStep(null)}>
      {selectedStation && <div className="text-center">
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-emerald-50 text-3xl font-bold text-emerald-700">{selectedStation.id}</div>
        <h3 className="mt-4 text-xl font-bold text-slate-900">{stationDisplayName(selectedStation)}</h3>
        {selectedStation.location && <p className="mt-2 flex items-center justify-center gap-2 text-sm text-slate-600"><span aria-hidden="true">⌖</span>{selectedStation.location}</p>}
        {selectedStation.instructions && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-left text-sm leading-6 text-amber-950"><p className="font-semibold">{flow.handoffInstructions}</p><p className="mt-1 text-amber-800">{selectedStation.instructions}</p></div>}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button data-autofocus type="button" disabled={selectedStation.id === destination} onClick={() => chooseStation("pickup")} className="min-h-12 rounded-xl border border-blue-200 bg-blue-50 px-4 font-semibold text-blue-800 disabled:opacity-40">{flow.useAsPickup}</button>
          <button type="button" disabled={selectedStation.id === pickup} onClick={() => chooseStation("destination")} className="min-h-12 rounded-xl bg-blue-600 px-4 font-semibold text-white disabled:bg-slate-300">{flow.useAsDestination}</button>
        </div>
      </div>}
    </Modal>

    <Modal open={step === "details"} title={flow.deliveryDetails} subtitle={flow.stepTwo} closeLabel={flow.closeModal} onClose={() => setStep(null)} restoreRef={continueRef}>
      <RouteSummary pickup={pickupStation} destination={destinationStation} />
      <div className="mt-6 grid gap-5">
        <Field label={copy.recipientName}><input data-autofocus value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={100} placeholder={copy.recipientPlaceholder} className={inputClass} /></Field>
        <Field label={copy.deliveryNote}><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={NOTE_MAX_LENGTH} rows={4} placeholder={copy.notePlaceholder} className={inputClass} /><span className="text-right text-xs text-slate-400">{note.length}/{NOTE_MAX_LENGTH}</span></Field>
        {user?.role === "ADMIN" ? <Field label={copy.priority}><select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} className={inputClass}><option value="NORMAL">{copy.normalPriority}</option><option value="HIGH">{copy.highPriority}</option></select></Field> :
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="text-sm font-semibold text-slate-700">{copy.priority}</p><div className="mt-2"><PriorityBadge priority="NORMAL" /></div><p className="mt-2 text-xs text-slate-500">{flow.normalPolicy}</p></div>}
      </div>
      <Actions back={flow.back} next={previewing ? flow.checkingRoute : flow.review} onBack={() => setStep(null)} onNext={() => setStep("review")} disabled={previewing || !routeReady} />
    </Modal>

    <Modal open={step === "review"} title={flow.reviewDelivery} subtitle={flow.stepThree} closeLabel={flow.closeModal} onClose={() => !submitting && setStep(null)} restoreRef={continueRef}>
      <dl className="grid gap-3 text-sm">
        <ReviewRow label={copy.pickup} value={stationLabel(pickupStation)} /><ReviewRow label={copy.destination} value={stationLabel(destinationStation)} />
        <ReviewRow label={flow.routeDistance} value={preview ? `${preview.totalDistanceMeters.toFixed(1)} m` : flow.unavailable} /><ReviewRow label={flow.travelTime} value={formatDuration(travel, locale)} />
        <ReviewRow label={flow.estimatedStart} value={formatDuration(start, locale)} /><ReviewRow label={flow.estimatedCompletion} value={formatDuration(completion, locale)} />
        <div className="my-1 border-t border-slate-200" /><ReviewRow label={copy.recipient} value={recipient.trim() || copy.notSpecified} /><ReviewRow label={copy.deliveryNote} value={note.trim() || copy.noNote} /><ReviewRow label={copy.priority} value={priority === "HIGH" ? copy.highPriority : copy.normalPriority} />
      </dl>
      {submitError && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</p>}
      <Actions back={flow.back} next={submitting ? copy.creating : copy.createDelivery} onBack={() => setStep("details")} onNext={() => void submit()} disabled={submitting || previewing || !routeReady} />
    </Modal>

    <Modal open={step === "success" && Boolean(success)} title={flow.requestCreated} subtitle={flow.requestCreatedDetail} closeLabel={flow.closeModal} onClose={() => router.push("/")} restoreRef={continueRef}>
      {success && <div><div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700">✓</div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5 text-center"><p className="text-sm text-blue-700">{flow.taskId}</p><p className="mt-1 text-2xl font-bold text-slate-950">{success.taskId}</p>
          <dl className="mt-5 grid gap-3 text-left text-sm"><ReviewRow label={flow.queuePosition} value={success.queuePosition === 0 ? flow.activeNow : String(success.queuePosition)} /><ReviewRow label={flow.estimatedStart} value={formatDuration(success.start, locale)} /><ReviewRow label={flow.estimatedCompletion} value={formatDuration(success.completion, locale)} /></dl></div>
        <div className="mt-6 grid gap-3"><button data-autofocus type="button" onClick={() => router.push("/tasks")} className="min-h-12 rounded-xl bg-blue-600 px-5 font-semibold text-white">{flow.viewMyDelivery}</button><button type="button" onClick={() => router.push("/")} className="min-h-12 rounded-xl border border-slate-300 px-5 font-semibold text-slate-700">{flow.backToDashboard}</button></div>
      </div>}
    </Modal>
  </>;
}

function Modal({ open, title, subtitle, closeLabel, onClose, restoreRef, children }: { open: boolean; title: string; subtitle?: string; closeLabel: string; onClose: () => void; restoreRef?: RefObject<HTMLElement | null>; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  const titleId = `delivery-modal-${title.replace(/\s+/g, "-").toLowerCase()}`;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])"))?.focus());
    const close = () => closeRef.current();
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])"));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    addEventListener("keydown", keys);
    return () => { cancelAnimationFrame(frame); removeEventListener("keydown", keys); document.body.style.overflow = overflow; (restoreRef?.current ?? previous)?.focus(); };
  }, [open, restoreRef]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-xl font-bold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label={closeLabel} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button></header>{children}
    </section>
  </div>;
}

function StationSelect({ green = false, label, value, stations, disabledId, placeholder, onChange }: { green?: boolean; label: string; value: string; stations: Station[]; disabledId: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="block border-b border-slate-100 pb-4 last:border-0 last:pb-0"><span className="text-sm font-semibold text-slate-700">{label}</span><span className="mt-2 flex items-center gap-2"><span className={`h-3 w-3 shrink-0 rounded-full ${green ? "bg-emerald-500" : "bg-blue-600"}`} /><select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">{placeholder}</option>{stations.map((station) => <option key={station.id} value={station.id} disabled={station.id === disabledId}>{stationDisplayName(station)}</option>)}</select></span>{value && <span className="mt-2 block pl-5 text-xs leading-5 text-slate-500">{stations.find((station) => station.id === value)?.location}</span>}</label>;
}

function RouteState({ tone, title, detail }: { tone: "idle" | "loading" | "success" | "error"; title: string; detail: string }) {
  const colors = { idle: "border-slate-200 bg-slate-50 text-slate-700", loading: "border-blue-200 bg-blue-50 text-blue-800", success: "border-emerald-200 bg-emerald-50 text-emerald-800", error: "border-red-200 bg-red-50 text-red-800" };
  const icon = tone === "success" ? "✓" : tone === "error" ? "!" : tone === "loading" ? "…" : "↗";
  return <div className={`flex gap-3 rounded-xl border p-3 ${colors[tone]}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white font-bold">{icon}</span><div><p className="font-semibold">{title}</p><p className="mt-0.5 text-sm opacity-80">{detail}</p></div></div>;
}
function RouteSummary({ pickup, destination }: { pickup?: Station; destination?: Station }) { return <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4 text-sm font-semibold"><span className="truncate">{stationLabel(pickup)}</span><span className="text-blue-500">→</span><span className="truncate">{stationLabel(destination)}</span></div>; }
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="grid gap-2"><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>; }
function ReviewRow({ label, value }: { label: string; value: string }) { return <div className="grid grid-cols-[minmax(0,.9fr)_minmax(0,1.2fr)] gap-4"><dt className="text-slate-500">{label}</dt><dd className="break-words font-semibold text-slate-900">{value}</dd></div>; }
function Metric({ label, value, top = false }: { label: string; value: string; top?: boolean }) { return <div className={`${top ? "mt-2" : ""} flex justify-between gap-3`}><span className="text-blue-700">{label}</span><strong>{value}</strong></div>; }
function Actions({ back, next, onBack, onNext, disabled = false }: { back: string; next: string; onBack: () => void; onNext: () => void; disabled?: boolean }) { return <div className="mt-6 grid grid-cols-2 gap-3 border-t border-slate-200 pt-5"><button type="button" disabled={disabled} onClick={onBack} className="min-h-12 rounded-xl border border-slate-300 font-semibold text-slate-700 disabled:opacity-50">{back}</button><button type="button" disabled={disabled} onClick={onNext} className="min-h-12 rounded-xl bg-blue-600 font-semibold text-white disabled:bg-slate-300">{next}</button></div>; }
function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) { return <div className={`mb-3 rounded-xl border px-4 py-3 text-sm ${error ? "border-red-100 bg-red-50 text-red-700" : "border-amber-100 bg-amber-50 text-amber-800"}`}>{children}</div>; }
function stationDisplayName(station: Station) { return station.description ? `${station.name} — ${station.description}` : station.name; }
function stationLabel(station?: Station) { return station ? stationDisplayName(station) : "—"; }

function formatDuration(seconds: number | undefined, locale: "en" | "th") {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return locale === "th" ? "กำลังคำนวณ" : "Calculating";
  if (seconds < 1) return locale === "th" ? "ตอนนี้" : "Now";
  const total = Math.ceil(seconds), minutes = Math.floor(total / 60), remainder = total % 60;
  if (!minutes) return locale === "th" ? `${remainder} วินาที` : `${remainder} sec`;
  if (!remainder) return locale === "th" ? `ประมาณ ${minutes} นาที` : `about ${minutes} min`;
  return locale === "th" ? `ประมาณ ${minutes} นาที ${remainder} วินาที` : `about ${minutes} min ${remainder} sec`;
}

function robotStateLabel(state: string, locale: "en" | "th") {
  const labels: Record<string, [string, string]> = {
    IDLE: ["Available", "พร้อมใช้งาน"], GOING_TO_PICKUP: ["Busy · collecting", "ไม่ว่าง · กำลังไปรับพัสดุ"],
    WAITING_FOR_LOADING: ["Busy · waiting for loading", "ไม่ว่าง · กำลังรอโหลดพัสดุ"], DELIVERING: ["Busy · delivering", "ไม่ว่าง · กำลังจัดส่ง"],
    WAITING_FOR_UNLOADING: ["Busy · waiting for collection", "ไม่ว่าง · กำลังรอรับพัสดุ"], ERROR: ["Temporarily unavailable", "ไม่พร้อมใช้งานชั่วคราว"], OFFLINE: ["Offline", "ออฟไลน์"]
  };
  const value = labels[state] ?? [state, state]; return locale === "th" ? value[1] : value[0];
}
