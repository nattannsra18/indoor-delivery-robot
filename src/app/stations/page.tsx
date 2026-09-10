"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import RobotMap from "@/components/RobotMap";
import ActionToast from "@/components/ActionToast";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import * as api from "@/lib/api";
import { stationText } from "@/lib/i18n";
import type { OccupancyGridMap, RobotMapCatalog, RobotMapRecord, Station } from "@/types";

type DraftPose = { x: number; y: number; yaw: number };

export default function StationsPage() {
  const { locale, format } = useLocale();
  const copy = stationText[locale];
  const { occupancyMap, addStation, updateStation, removeStation, backendOnline, refreshAll, selectedRobotId } = useDeliveryApi();
  const [catalog, setCatalog] = useState<RobotMapCatalog>();
  const [selectedMapId, setSelectedMapId] = useState("");
  const [mapStations, setMapStations] = useState<Station[]>([]);
  const [catalogError, setCatalogError] = useState("");
  const [activating, setActivating] = useState(false);
  const [editingId, setEditingId] = useState<string>();
  const [pendingRemove, setPendingRemove] = useState<Station>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [instructions, setInstructions] = useState("");
  const [draftPose, setDraftPose] = useState<DraftPose>();
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const catalogRequestRef = useRef(0);
  const stationRequestRef = useRef(0);

  const selectedMap = useMemo(() => catalog?.maps.find((item) => item.id === selectedMapId), [catalog, selectedMapId]);
  const isActiveMap = Boolean(selectedMapId && selectedMapId === catalog?.activeMapId);

  const loadCatalog = useCallback(async () => {
    const requestId = ++catalogRequestRef.current;
    try {
      const next = await api.getMapCatalog(selectedRobotId || undefined);
      if (requestId !== catalogRequestRef.current) return;
      setCatalog(next);
      setCatalogError("");
      setSelectedMapId((current) => current && next.maps.some((map) => map.id === current) ? current : next.activeMapId ?? next.maps[0]?.id ?? "");
    } catch (error) {
      if (requestId !== catalogRequestRef.current) return;
      try {
        await api.refreshMapCatalog(selectedRobotId || undefined);
        await new Promise((resolve) => window.setTimeout(resolve, 600));
        const next = await api.getMapCatalog(selectedRobotId || undefined);
        if (requestId !== catalogRequestRef.current) return;
        setCatalog(next);
        setCatalogError("");
        setSelectedMapId(next.activeMapId ?? next.maps[0]?.id ?? "");
      } catch {
        if (requestId !== catalogRequestRef.current) return;
        setCatalogError(error instanceof Error ? error.message : copy.catalogUnavailable);
      }
    }
  }, [copy.catalogUnavailable, selectedRobotId]);

  const loadStations = useCallback(async (mapId: string) => {
    const requestId = ++stationRequestRef.current;
    if (!mapId) return setMapStations([]);
    try {
      const next = await api.getStations(mapId, selectedRobotId || undefined);
      if (requestId === stationRequestRef.current) setMapStations(next);
    } catch (error) {
      if (requestId !== stationRequestRef.current) return;
      setIsError(true);
      setMessage(error instanceof Error ? error.message : copy.addFailure);
    }
  }, [copy.addFailure, selectedRobotId]);

  useEffect(() => {
    catalogRequestRef.current += 1;
    stationRequestRef.current += 1;
    setCatalog(undefined);
    setSelectedMapId("");
    setMapStations([]);
    setCatalogError("");
    setPendingRemove(undefined);
    setMessage("");
    setIsError(false);
    resetStationForm();
  }, [selectedRobotId]);

  useEffect(() => { void loadCatalog(); }, [loadCatalog]);
  useEffect(() => { void loadStations(selectedMapId); }, [loadStations, selectedMapId]);

  function resetStationForm() {
    setEditingId(undefined); setName(""); setDescription(""); setLocation("");
    setInstructions(""); setDraftPose(undefined);
  }

  function selectMap(mapId: string) {
    setSelectedMapId(mapId); resetStationForm(); setMessage(""); setPendingRemove(undefined);
  }

  function beginEdit(station: Station) {
    setEditingId(station.id); setName(station.name); setDescription(station.description ?? "");
    setLocation(station.location ?? ""); setInstructions(station.instructions ?? "");
    setDraftPose({ x: station.x, y: station.y, yaw: station.yaw });
    setMessage(""); setPendingRemove(undefined);
  }

  function choosePose(pose: DraftPose) {
    if (occupancyMap && !isKnownFreeSpace(occupancyMap, pose.x, pose.y)) {
      setIsError(true); setMessage(copy.occupied); return;
    }
    setDraftPose(pose); setMessage(""); setIsError(false);
  }

  async function activateSelectedMap() {
    if (!selectedMap || selectedMap.active || !selectedMap.available) return;
    setActivating(true); setMessage(""); setIsError(false);
    try {
      let operation = await api.activateRobotMap(selectedMap.id, selectedRobotId || undefined);
      while (operation.status === "PENDING") {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        operation = await api.getMapOperation(operation.commandId);
      }
      if (operation.status === "FAILED") throw new Error(operation.detail || copy.switchFailed);
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      await Promise.all([loadCatalog(), refreshAll(), loadStations(selectedMap.id)]);
      setMessage(copy.switchSucceeded);
    } catch (error) {
      setIsError(true); setMessage(error instanceof Error ? error.message : copy.switchFailed);
    } finally { setActivating(false); }
  }

  async function handleSaveStation(event: FormEvent) {
    event.preventDefault();
    if (!selectedMapId || !isActiveMap || !name.trim() || !draftPose) {
      setIsError(true); setMessage(draftPose ? copy.validation : copy.positionRequired); return;
    }
    if (occupancyMap && !isKnownFreeSpace(occupancyMap, draftPose.x, draftPose.y)) {
      setIsError(true); setMessage(copy.occupied); return;
    }
    setBusy(true); setMessage(""); setIsError(false);
    const payload = { mapId: selectedMapId, name: name.trim(), description: description.trim() || copy.defaultDescription, location: location.trim() || undefined, instructions: instructions.trim() || undefined, ...draftPose };
    try {
      const saved = editingId ? await updateStation(editingId, payload) : await addStation(payload);
      await loadStations(selectedMapId);
      setMessage(format(editingId ? copy.updated : copy.added, { name: saved.name, id: saved.id }));
      resetStationForm();
    } catch (error) {
      setIsError(true); setMessage(error instanceof Error ? error.message : copy.addFailure);
    } finally { setBusy(false); }
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    const station = pendingRemove;
    setBusy(true);
    const result = await removeStation(station.id);
    setIsError(!result.ok);
    setMessage(
      result.ok
        ? format(copy.removed, { name: station.name, id: station.id })
        : result.message.includes("active or queued")
          ? copy.stationInUse
          : result.message
    );
    if (result.ok) {
      if (editingId === station.id) resetStationForm();
      await loadStations(selectedMapId);
    }
    setPendingRemove(undefined); setBusy(false);
  }

  return <>
    {message && (
      <ActionToast
        kind={isError ? "error" : "success"}
        title={isError ? copy.errorTitle : copy.successTitle}
        body={message}
        closeLabel={copy.close}
        onClose={() => setMessage("")}
      />
    )}
    <PageHeader title={copy.title} description={copy.description} />
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <label className="grid gap-2">
          <span className="text-sm font-bold text-slate-700">{copy.selectMap}</span>
          <select value={selectedMapId} onChange={(event) => selectMap(event.target.value)} disabled={!catalog || activating} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-slate-900 outline-none focus:ring-2 focus:ring-blue-500">
            {!catalog?.maps.length && <option value="">{copy.noMap}</option>}
            {catalog?.maps.map((map) => <option key={map.id} value={map.id}>{map.name} · {map.id}{map.active ? ` · ${copy.active}` : ""}</option>)}
          </select>
        </label>
        <div className="flex flex-wrap gap-2">
          <Link href="/maps" className="inline-flex min-h-11 items-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-700 hover:border-blue-300 hover:text-blue-700">{copy.manageMap}</Link>
          {!isActiveMap && selectedMap && <button type="button" onClick={() => void activateSelectedMap()} disabled={activating || !selectedMap.available || !backendOnline} className="min-h-11 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-300">{activating ? copy.activating : copy.activate}</button>}
        </div>
      </div>
      {catalogError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">{catalogError}</p>}
      {selectedMap && <MapSummary map={selectedMap} active={isActiveMap} copy={copy} />}
    </section>

    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,.7fr)]">
      <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-bold text-slate-900">{copy.liveMap}</h2><p className="mt-1 text-sm text-slate-500">{isActiveMap ? copy.mapHelp : copy.inactiveHelp}</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-bold ${isActiveMap ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{isActiveMap ? copy.active : copy.inactive}</span>
        </div>
        {isActiveMap ? <RobotMap stationsOverride={mapStations} draftPose={draftPose} draftPoseLabel={copy.selectedPose} onMapPoseSelect={choosePose} mapAriaLabel={copy.mapAria} showTechnicalDetails={false} /> : <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><div><p className="font-bold text-slate-800">{selectedMap?.available ? copy.inactive : copy.mapUnavailable}</p><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">{copy.inactiveHelp}</p></div></div>}
      </section>

      <form onSubmit={handleSaveStation} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
        <div className="flex items-center justify-between gap-3"><h2 className="font-bold text-slate-900">{editingId ? copy.editStation : copy.add}</h2>{editingId && <button type="button" onClick={resetStationForm} className="text-sm font-bold text-slate-500 hover:text-slate-900">{copy.cancelEdit}</button>}</div>
        <p className="mt-1 text-sm leading-6 text-slate-500">{copy.persisted}</p>
        <div className="mt-5 grid gap-4">
          <Input label={copy.stationName} value={name} onChange={setName} disabled={!isActiveMap} />
          <Input label={copy.stationDescription} value={description} onChange={setDescription} disabled={!isActiveMap} />
          <Input label={copy.stationLocation} value={location} onChange={setLocation} disabled={!isActiveMap} />
          <TextArea label={copy.handoffInstructions} value={instructions} onChange={setInstructions} disabled={!isActiveMap} />
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{copy.coordinates}</p>
            {draftPose ? <div className="mt-2 grid grid-cols-3 gap-2 text-sm"><PoseValue label="X" value={draftPose.x.toFixed(2)} /><PoseValue label="Y" value={draftPose.y.toFixed(2)} /><PoseValue label={copy.heading} value={`${radiansToDegrees(draftPose.yaw).toFixed(0)}°`} /></div> : <p className="mt-2 text-sm text-amber-700">{copy.positionRequired}</p>}
          </div>
          <button type="submit" disabled={busy || !backendOnline || !isActiveMap || !draftPose} className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">{busy ? copy.save : editingId ? copy.saveChanges : copy.addAction}</button>
        </div>
      </form>
    </div>

    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="font-bold text-slate-900">{copy.configured}</h2><p className="mt-1 text-sm text-slate-500">{selectedMap?.name ?? copy.noMap}</p></div>
      <div className="mt-4 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {mapStations.map((station) => <article key={station.id} className={`rounded-xl border p-4 ${editingId === station.id ? "border-blue-400 bg-blue-50/40" : "border-slate-200"}`}>
          <p className="font-bold text-slate-900">{stationDisplayName(station)}</p><p className="mt-1 text-xs font-semibold text-slate-500">{station.id} · {format(copy.pose, { x: station.x.toFixed(2), y: station.y.toFixed(2), yaw: radiansToDegrees(station.yaw).toFixed(0) })}</p>
          {station.location && <p className="mt-3 text-sm text-slate-600">{station.location}</p>}
          {pendingRemove?.id === station.id ? <div className="mt-4 rounded-xl bg-rose-50 p-3"><p className="font-bold text-rose-900">{copy.confirmRemove}</p><p className="mt-1 text-sm leading-5 text-rose-700">{format(copy.confirmRemoveHelp, { name: station.name })}</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => setPendingRemove(undefined)} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold">{copy.cancel}</button><button type="button" onClick={() => void confirmRemove()} disabled={busy} className="min-h-10 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white disabled:opacity-50">{busy ? copy.removing : copy.confirm}</button></div></div> : <div className="mt-4 flex gap-2"><button type="button" onClick={() => beginEdit(station)} disabled={busy || !backendOnline || !isActiveMap} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 disabled:opacity-50">{copy.edit}</button><button type="button" onClick={() => setPendingRemove(station)} disabled={busy || !backendOnline || !isActiveMap} className="min-h-10 rounded-lg border border-rose-200 px-3 text-sm font-bold text-rose-700 disabled:opacity-50">{copy.remove}</button></div>}
        </article>)}
        {mapStations.length === 0 && <p className="py-6 text-sm text-slate-500">{copy.empty}</p>}
      </div>
    </section>
  </>;
}

function MapSummary({ map, active, copy }: { map: RobotMapRecord; active: boolean; copy: Record<string, string> }) {
  return <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600"><span className="font-bold text-slate-900">{map.name}</span><code className="text-xs">{map.id}</code><span>{copy.building}: {map.building || "—"}</span><span>{copy.floor}: {map.floor || "—"}</span>{map.areaDescription && <span>{copy.areaDescription}: {map.areaDescription}</span>}<span className={`ml-auto rounded-full px-2.5 py-1 text-xs font-bold ${active ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{active ? copy.active : copy.inactive}</span></div>;
}

function Input({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="grid gap-2"><span className="text-sm font-bold text-slate-700">{label}</span><input value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-xl border border-slate-300 px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" /></label>;
}

function TextArea({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled?: boolean }) {
  return <label className="grid gap-2"><span className="text-sm font-bold text-slate-700">{label}</span><textarea rows={3} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className="min-w-0 resize-y rounded-xl border border-slate-300 px-3 py-3 outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100" /></label>;
}

function PoseValue({ label, value }: { label: string; value: string }) { return <div><span className="block text-xs text-slate-500">{label}</span><strong className="text-slate-900">{value}</strong></div>; }
function radiansToDegrees(value: number) { return value * 180 / Math.PI; }

function isKnownFreeSpace(map: OccupancyGridMap, x: number, y: number) {
  const dx = x - map.originX; const dy = y - map.originY;
  const cosine = Math.cos(map.originYaw); const sine = Math.sin(map.originYaw);
  const column = Math.floor((cosine * dx + sine * dy) / map.resolution);
  const row = Math.floor((-sine * dx + cosine * dy) / map.resolution);
  if (column < 0 || row < 0 || column >= map.width || row >= map.height) return false;
  const occupancy = map.data[row * map.width + column];
  return occupancy >= 0 && occupancy < 50;
}

function stationDisplayName(station: Station) { return station.description ? `${station.name} — ${station.description}` : station.name; }
