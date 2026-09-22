"use client";

import Link from "next/link";
import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import RobotReadinessNotice from "@/components/RobotReadinessNotice";
import RobotMap from "@/components/RobotMap";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useAuth } from "@/context/AuthContext";
import { useLocale } from "@/context/LocaleContext";
import { adminUiText, dashboardText, deliveryFlowText, deliveryText } from "@/lib/i18n";
import { routePreviewIsFresh } from "@/lib/routePreview";
import { allowedPriority } from "@/lib/taskCreation";
import type { Station, TaskPriority, TaskRoutePreview } from "@/types";

const NOTE_MAX_LENGTH = 500;
const inputClass = "min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100";

export default function DashboardDeliveryMap() {
  const { locale } = useLocale();
  const copy = deliveryText[locale];
  const flow = deliveryFlowText[locale];
  const dashboard = dashboardText[locale];
  const ui = adminUiText[locale];
  const { user } = useAuth();
  const {
    backendOnline,
    createTask,
    emergencyStop,
    fleet,
    occupancyMap,
    previewTaskRoute,
    robot,
    selectedRobotId,
    stations,
  } = useDeliveryApi();
  const [open, setOpen] = useState(false);
  const [clickedStation, setClickedStation] = useState<Station>();
  const [pickup, setPickup] = useState("");
  const [destination, setDestination] = useState("");
  const [supervisedMode, setSupervisedMode] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("NORMAL");
  const [preview, setPreview] = useState<TaskRoutePreview>();
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [previewAttempt, setPreviewAttempt] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [createdTaskId, setCreatedTaskId] = useState("");

  const selectedFleetRobot = useMemo(
    () => fleet.find((item) => item.id === selectedRobotId),
    [fleet, selectedRobotId],
  );
  const selectedDeliveryRobotId = selectedFleetRobot?.id || selectedRobotId || robot.id;
  const requiresSupervisedMode = Boolean(
    selectedFleetRobot?.readinessStatus === "DEGRADED"
      && selectedFleetRobot.allowsSupervisedNavigation,
  );
  const supervisedAuthorized = requiresSupervisedMode && supervisedMode;
  const selectedRobotBlocked = Boolean(
    selectedFleetRobot
      && !selectedFleetRobot.acceptsDeliveries
      && !selectedFleetRobot.allowsSupervisedNavigation,
  );
  const canPlan = Boolean(
    open
      && pickup
      && destination
      && pickup !== destination
      && selectedDeliveryRobotId
      && !selectedRobotBlocked
      && backendOnline
      && occupancyMap
      && !emergencyStop?.latched
      && (!requiresSupervisedMode || supervisedMode),
  );

  useEffect(() => {
    if (!canPlan) {
      setPreview(undefined);
      setPreviewError("");
      setPreviewing(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreviewing(true);
      setPreview(undefined);
      setPreviewError("");
      setSubmitError("");
      try {
        const result = await previewTaskRoute({
          pickupStationId: pickup,
          destinationStationId: destination,
          priority: allowedPriority(user?.role, priority),
          robotId: selectedDeliveryRobotId || undefined,
          supervisedMode: user?.role === "ADMIN" && supervisedAuthorized,
        });
        if (!cancelled) setPreview(result);
      } catch (error) {
        if (!cancelled) {
          setPreviewError(
            error instanceof Error ? error.message : copy.routeUnavailable,
          );
        }
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    backendOnline,
    canPlan,
    copy.routeUnavailable,
    destination,
    occupancyMap?.revision,
    pickup,
    previewAttempt,
    previewTaskRoute,
    priority,
    selectedDeliveryRobotId,
    supervisedAuthorized,
    user?.role,
  ]);

  function openFromStation(station: Station) {
    setClickedStation(station);
    setPickup(station.id);
    setDestination("");
    setSupervisedMode(false);
    setRecipient("");
    setNote("");
    setPriority("NORMAL");
    setPreview(undefined);
    setPreviewError("");
    setSubmitError("");
    setCreatedTaskId("");
    setOpen(true);
  }

  function closeDialog() {
    if (submitting) return;
    setOpen(false);
    setPreview(undefined);
    setPreviewError("");
    setSubmitError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!preview || !routePreviewIsFresh(preview.expiresAt)) {
      setSubmitError(flow.routeExpired);
      setPreview(undefined);
      setPreviewAttempt((value) => value + 1);
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    try {
      const task = await createTask({
        pickupStationId: pickup,
        destinationStationId: destination,
        priority: allowedPriority(user?.role, priority),
        recipientName: recipient,
        deliveryNote: note,
        previewId: preview.previewId,
        robotId: preview.robotId,
        supervisedMode: preview.supervisedMode,
      });
      setCreatedTaskId(task.id);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : copy.createUnavailable,
      );
      setPreview(undefined);
      setPreviewAttempt((value) => value + 1);
    } finally {
      setSubmitting(false);
    }
  }

  const routeReady = Boolean(
    preview && routePreviewIsFresh(preview.expiresAt),
  );
  const mapInteractive = backendOnline
    && Boolean(occupancyMap)
    && stations.length > 0
    && !emergencyStop?.latched;

  return <>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-600">{ui.liveOperations}</p>
          <h2 className="mt-1 text-lg font-bold text-slate-950">{dashboard.liveMap}</h2>
          <p className="mt-1 text-sm text-slate-500">{dashboard.liveMapHelp}</p>
          <p className="mt-1 text-xs font-medium text-blue-700">{flow.dashboardMapHint}</p>
        </div>
        <div className="flex gap-2">
          <Connection label={occupancyMap ? dashboard.mapAvailable : dashboard.waitingMap} active={Boolean(occupancyMap)} />
          <Connection label={robot.online ? (locale === "th" ? "ตำแหน่งสด" : "Live Pose") : (locale === "th" ? "รอตำแหน่ง" : "Pose Waiting")} active={robot.online} />
        </div>
      </div>
      <div className="p-3">
        <RobotMap
          interactive={mapInteractive}
          onStationSelect={openFromStation}
          routePreview={preview}
          selectedPickupStationId={pickup}
          selectedDestinationStationId={destination}
          showStationButtons={false}
          viewportSize="dashboard"
        />
      </div>
    </section>

    <Modal
      open={open}
      title={copy.createDelivery}
      subtitle={flow.dashboardModalSubtitle}
      closeLabel={flow.closeModal}
      onClose={closeDialog}
    >
      {createdTaskId ? (
        <div className="text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl font-bold text-emerald-700">✓</div>
          <h3 className="mt-4 text-xl font-bold text-slate-950">{flow.requestCreated}</h3>
          <p className="mt-2 text-sm text-slate-500">{flow.taskId}</p>
          <p className="mt-1 text-2xl font-bold text-blue-700">{createdTaskId}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={closeDialog} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold text-slate-700 hover:bg-slate-50">{flow.backToDashboard}</button>
            <Link href="/tasks" className="grid min-h-11 place-items-center rounded-xl bg-blue-600 px-4 font-semibold text-white hover:bg-blue-700">{flow.viewMyDelivery}</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          {clickedStation && <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white font-bold text-blue-700 shadow-sm">{clickedStation.id}</span>
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">{flow.selectStation}</p><p className="truncate font-bold text-slate-950">{clickedStation.description ? `${clickedStation.name} — ${clickedStation.description}` : clickedStation.name}</p></div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => { setPickup(clickedStation.id); if (destination === clickedStation.id) setDestination(""); setPreview(undefined); }} className={`min-h-10 rounded-xl border px-3 text-sm font-semibold ${pickup === clickedStation.id ? "border-blue-600 bg-blue-600 text-white" : "border-blue-200 bg-white text-blue-800"}`}>{flow.useAsPickup}</button>
              <button type="button" onClick={() => { setDestination(clickedStation.id); if (pickup === clickedStation.id) setPickup(""); setPreview(undefined); }} className={`min-h-10 rounded-xl border px-3 text-sm font-semibold ${destination === clickedStation.id ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-800"}`}>{flow.useAsDestination}</button>
            </div>
          </div>}
          <div className="grid gap-4 sm:grid-cols-2">
            <StationSelect label={copy.pickup} value={pickup} stations={stations} disabledId={destination} placeholder={flow.choosePickup} onChange={(value) => { setPickup(value); setPreview(undefined); }} />
            <StationSelect label={copy.destination} value={destination} stations={stations} disabledId={pickup} placeholder={flow.chooseDestination} onChange={(value) => { setDestination(value); setPreview(undefined); }} />
          </div>

          <div className="mt-5 border-t border-slate-200 pt-5">
            <div className={`rounded-xl border p-3 ${selectedRobotBlocked ? "border-red-200 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{flow.selectedRobot}</p>
              <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-slate-950">{selectedFleetRobot?.name ?? robot.name}</p>
                {selectedFleetRobot && <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedRobotBlocked ? "bg-red-100 text-red-700" : requiresSupervisedMode ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-700"}`}>{selectedFleetRobot.readinessStatus}</span>}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">{flow.selectedRobotLockedHelp}</p>
              {(selectedRobotBlocked || requiresSupervisedMode) && <div className="mt-2"><RobotReadinessNotice robot={selectedFleetRobot} compact /></div>}
            </div>
            {user?.role === "ADMIN" && requiresSupervisedMode && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <label className="flex cursor-pointer items-start gap-3 font-semibold">
                <input type="checkbox" checked={supervisedMode} onChange={(event) => { setSupervisedMode(event.target.checked); setPreview(undefined); }} className="mt-1 h-4 w-4" />
                <span>{flow.supervisedConfirm}</span>
              </label>
              <p className="mt-2 text-xs leading-5 text-amber-800">{flow.supervisedHelp}</p>
            </div>}
          </div>

          <details className="group mt-5 rounded-xl border border-slate-200 bg-slate-50/70">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-3"><span>{flow.deliveryDetails}</span><span className="text-slate-400 transition group-open:rotate-180">⌄</span></span>
            </summary>
            <div className="grid gap-4 border-t border-slate-200 p-4 sm:grid-cols-2">
              <Field label={copy.recipientName}><input value={recipient} onChange={(event) => setRecipient(event.target.value)} maxLength={100} placeholder={copy.recipientPlaceholder} className={inputClass} /></Field>
              <Field label={copy.priority}><select value={priority} onChange={(event) => { setPriority(event.target.value as TaskPriority); setPreview(undefined); }} className={inputClass}><option value="NORMAL">{copy.normalPriority}</option><option value="HIGH">{copy.highPriority}</option></select></Field>
              <Field label={copy.deliveryNote} wide><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={NOTE_MAX_LENGTH} rows={3} placeholder={copy.notePlaceholder} className={inputClass} /><span className="text-right text-xs text-slate-400">{note.length}/{NOTE_MAX_LENGTH}</span></Field>
            </div>
          </details>

          <div className="mt-5 min-h-20" aria-live="polite">
            {previewing && <RouteState tone="loading" title={flow.checkingRoute} detail={flow.checkingRouteDetail} />}
            {!previewing && preview && <RouteState tone="success" title={flow.routeAvailable} detail={`${preview.totalDistanceMeters.toFixed(1)} m · ${formatDuration(preview.travelTimeSeconds, locale)}`} />}
            {!previewing && previewError && <><RouteState tone="error" title={flow.routeUnavailable} detail={previewError} /><button type="button" onClick={() => setPreviewAttempt((value) => value + 1)} className="mt-2 text-sm font-semibold text-blue-700 underline">{flow.tryAgain}</button></>}
            {!previewing && !preview && !previewError && requiresSupervisedMode && !supervisedMode && <RouteState tone="idle" title={flow.supervisedRequired} detail={flow.supervisedHelp} />}
            {!previewing && !preview && !previewError && selectedRobotBlocked && <RobotReadinessNotice robot={selectedFleetRobot} compact />}
            {!previewing && !preview && !previewError && !selectedRobotBlocked && (!requiresSupervisedMode || supervisedMode) && <RouteState tone="idle" title={flow.selectTwoStations} detail={flow.routeWillAppear} />}
          </div>
          {submitError && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</p>}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5">
            <Link href="/delivery" className="text-sm font-semibold text-blue-700 hover:underline">{flow.fullDeliveryForm}</Link>
            <div className="flex gap-2">
              <button type="button" onClick={closeDialog} className="min-h-11 rounded-xl border border-slate-300 px-5 font-semibold text-slate-700 hover:bg-slate-50">{flow.back}</button>
              <button type="submit" disabled={!routeReady || previewing || submitting} className="min-h-11 rounded-xl bg-blue-600 px-5 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{submitting ? copy.creating : copy.createDelivery}</button>
            </div>
          </div>
        </form>
      )}
    </Modal>
  </>;
}

function StationSelect({ label, value, stations, disabledId, placeholder, onChange }: { label: string; value: string; stations: Station[]; disabledId: string; placeholder: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2 text-sm font-semibold text-slate-700"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">{placeholder}</option>{stations.map((station) => <option key={station.id} value={station.id} disabled={station.id === disabledId}>{station.description ? `${station.name} — ${station.description}` : station.name}</option>)}</select>{value && <span className="text-xs font-normal leading-5 text-slate-500">{stations.find((station) => station.id === value)?.location}</span>}</label>;
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: ReactNode }) {
  return <label className={`grid gap-2 ${wide ? "sm:col-span-2" : ""}`}><span className="text-sm font-semibold text-slate-700">{label}</span>{children}</label>;
}

function RouteState({ tone, title, detail }: { tone: "idle" | "loading" | "success" | "error"; title: string; detail: string }) {
  const colors = { idle: "border-slate-200 bg-slate-50 text-slate-700", loading: "border-blue-200 bg-blue-50 text-blue-800", success: "border-emerald-200 bg-emerald-50 text-emerald-800", error: "border-red-200 bg-red-50 text-red-800" };
  const icon = tone === "success" ? "✓" : tone === "error" ? "!" : tone === "loading" ? "…" : "○";
  return <div className={`flex gap-3 rounded-xl border p-3 ${colors[tone]}`}><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white font-bold">{icon}</span><div><p className="font-semibold">{title}</p><p className="mt-0.5 text-sm opacity-80">{detail}</p></div></div>;
}

function Modal({ open, title, subtitle, closeLabel, onClose, children }: { open: boolean; title: string; subtitle?: string; closeLabel: string; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>("button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled])")?.focus());
    function keys(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>("button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex='-1'])"));
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
    }
    addEventListener("keydown", keys);
    return () => { cancelAnimationFrame(frame); removeEventListener("keydown", keys); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  if (!open) return null;
  const titleId = "dashboard-create-delivery-title";
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-6">
      <header className="mb-5 flex items-start justify-between gap-4"><div><h2 id={titleId} className="text-xl font-bold text-slate-950">{title}</h2>{subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}</div><button type="button" onClick={onClose} aria-label={closeLabel} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button></header>
      {children}
    </section>
  </div>;
}

function Connection({ label, active }: { label: string; active: boolean }) {
  return <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-slate-400"}`} />{label}</span>;
}

function formatDuration(seconds: number | undefined, locale: "en" | "th") {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return locale === "th" ? "กำลังคำนวณ" : "Calculating";
  if (seconds < 1) return locale === "th" ? "ตอนนี้" : "Now";
  const total = Math.ceil(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  if (!minutes) return locale === "th" ? `${remainder} วินาที` : `${remainder} sec`;
  if (!remainder) return locale === "th" ? `ประมาณ ${minutes} นาที` : `about ${minutes} min`;
  return locale === "th" ? `ประมาณ ${minutes} นาที ${remainder} วินาที` : `about ${minutes} min ${remainder} sec`;
}
