"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import RobotMap from "@/components/RobotMap";
import { useLocale } from "@/context/LocaleContext";
import {
  activateRobotMap,
  deleteRobotMap,
  getMapCatalog,
  getMapCatalogOperation,
  getMapOperation,
  refreshMapCatalog,
  renameRobotMap,
  updateRobotMapDetails,
} from "@/lib/api";
import { formatDate, mapManagementActionsText, mapManagementText } from "@/lib/i18n";
import type { RobotMapCatalog, RobotMapRecord } from "@/types";

function fileSize(bytes: number, locale: string) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / 1024)} KB`;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(bytes / (1024 * 1024))} MB`;
}

export default function MapsPage() {
  const { locale } = useLocale();
  const copy = mapManagementText[locale];
  const actions = mapManagementActionsText[locale];
  const [catalog, setCatalog] = useState<RobotMapCatalog>();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [selectedMap, setSelectedMap] = useState<RobotMapRecord>();
  const [switchingMapId, setSwitchingMapId] = useState("");
  const [managedMap, setManagedMap] = useState<RobotMapRecord>();
  const [manageMode, setManageMode] = useState<"metadata" | "rename" | "delete">();
  const [operationBusy, setOperationBusy] = useState(false);
  const [mapName, setMapName] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [areaDescription, setAreaDescription] = useState("");
  const [newMapId, setNewMapId] = useState("");
  const readyCount = useMemo(() => catalog?.maps.filter((map) => map.available).length ?? 0, [catalog]);

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      setCatalog(await getMapCatalog());
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.loadFailed);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [copy.loadFailed]);

  useEffect(() => {
    void load(true);
    const interval = window.setInterval(() => void load(false), 10000);
    return () => window.clearInterval(interval);
  }, [load]);

  async function requestRefresh() {
    setRefreshing(true); setMessage(""); setError("");
    try {
      await refreshMapCatalog();
      setMessage(actions.syncSucceeded);
      window.setTimeout(() => void load(false), 500);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.loadFailed);
    } finally { setRefreshing(false); }
  }

  function openManagement(mode: "metadata" | "rename" | "delete", map: RobotMapRecord) {
    setManagedMap(map);
    setManageMode(mode);
    setMapName(map.name);
    setBuilding(map.building ?? "");
    setFloor(map.floor ?? "");
    setAreaDescription(map.areaDescription ?? "");
    setNewMapId(map.id);
  }

  async function applyManagement() {
    if (!managedMap || !manageMode) return;
    setOperationBusy(true); setMessage(""); setError("");
    try {
      let operation = manageMode === "metadata"
        ? await updateRobotMapDetails(managedMap.id, { name: mapName.trim(), building: building.trim() || undefined, floor: floor.trim() || undefined, areaDescription: areaDescription.trim() || undefined })
        : manageMode === "rename"
          ? await renameRobotMap(managedMap.id, newMapId.trim())
          : await deleteRobotMap(managedMap.id);
      while (operation.status === "PENDING") {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        operation = await getMapCatalogOperation(operation.commandId);
      }
      if (operation.status === "FAILED") throw new Error(operation.detail || actions.operationFailed);
      setMessage(manageMode === "metadata" ? actions.metadataSucceeded : manageMode === "rename" ? actions.renameSucceeded : actions.deleteSucceeded);
      setManagedMap(undefined); setManageMode(undefined);
      await new Promise((resolve) => window.setTimeout(resolve, 300));
      await load(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : actions.operationFailed);
    } finally { setOperationBusy(false); }
  }

  async function switchMap() {
    if (!selectedMap) return;
    const mapId = selectedMap.id;
    setSelectedMap(undefined);
    setSwitchingMapId(mapId);
    setMessage("");
    setError("");
    try {
      let operation = await activateRobotMap(mapId);
      while (operation.status === "PENDING") {
        await new Promise((resolve) => window.setTimeout(resolve, 300));
        operation = await getMapOperation(operation.commandId);
      }
      if (operation.status === "FAILED") {
        setError(operation.detail || copy.switchFailed);
        return;
      }
      setMessage(copy.switchSucceeded);
      await load(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : copy.switchFailed);
    } finally {
      setSwitchingMapId("");
    }
  }

  return <>
    <PageHeader title={copy.title} description={copy.description} />
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
      <p className="max-w-3xl text-sm leading-6 text-blue-900">{actions.sourcePolicy}</p>
      <button type="button" disabled={refreshing} onClick={() => void requestRefresh()} className="min-h-11 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{refreshing ? actions.syncing : actions.sync}</button>
    </div>
    {(message || error) && <p role={error ? "alert" : "status"} className={`mt-4 rounded-xl px-4 py-3 text-sm ${error ? "bg-rose-50 text-rose-800" : "bg-emerald-50 text-emerald-800"}`}>{error || message}</p>}

    <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-busy={loading}>
      <Summary label={copy.activeMap} value={catalog?.activeMapId ?? copy.noActive} tone="blue" />
      <Summary label={copy.robotSync} value={catalog?.robotOnline ? copy.connected : copy.offline} tone={catalog?.robotOnline ? "emerald" : "rose"} />
      <Summary label={copy.source} value={copy.rosFilesystem} tone="slate" />
      <Summary label={copy.readyMaps} value={`${readyCount} / ${catalog?.maps.length ?? 0}`} tone="violet" />
    </section>

    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold text-slate-950">{copy.livePreview}</h2><p className="mt-1 text-sm text-slate-500">{copy.livePreviewHelp}</p></header>
        <div className="p-3 md:p-4"><RobotMap showStationButtons={false} /></div>
      </section>
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <header><h2 className="font-bold text-slate-950">{copy.inventory}</h2><p className="mt-1 text-sm leading-6 text-slate-500">{copy.inventoryHelp}</p></header>
        {loading ? <div className="mt-5 h-40 animate-pulse rounded-2xl bg-slate-100" /> : !catalog?.maps.length ? <p className="mt-5 rounded-2xl bg-slate-50 p-5 text-sm text-slate-500">{copy.empty}</p> : <ul className="mt-5 space-y-3">{catalog.maps.map((map) => <li key={map.id} className={`rounded-2xl border p-4 ${map.active ? "border-blue-200 bg-blue-50/60" : "border-slate-200"}`}>
          <div className="flex items-start justify-between gap-3"><div><p className="font-bold text-slate-950">{map.name}</p><p className="mt-1 font-mono text-xs text-slate-500">{map.id}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${map.active ? "bg-blue-600 text-white" : map.available ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{map.active ? copy.active : map.available ? copy.ready : copy.unavailable}</span></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><dt className="text-slate-400">{copy.resolution}</dt><dd className="mt-1 font-semibold text-slate-700">{map.resolution ? `${map.resolution} m/cell` : "—"}</dd></div><div><dt className="text-slate-400">{copy.size}</dt><dd className="mt-1 font-semibold text-slate-700">{fileSize(map.sizeBytes, locale)}</dd></div><div className="col-span-2"><dt className="text-slate-400">{copy.files}</dt><dd className="mt-1 break-all font-mono text-slate-600">{map.yamlFile}{map.imageFile ? ` · ${map.imageFile}` : ""}</dd></div>{map.modifiedAt && <div className="col-span-2"><dt className="text-slate-400">{copy.updated}</dt><dd className="mt-1 text-slate-600">{formatDate(map.modifiedAt, locale)}</dd></div>}</dl>
          {(map.building || map.floor || map.areaDescription) ? <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600"><p className="font-semibold text-slate-800">{[map.building, map.floor].filter(Boolean).join(" · ")}</p>{map.areaDescription && <p className="mt-1">{map.areaDescription}</p>}</div> : <p className="mt-3 text-xs text-slate-400">{actions.noDetails}</p>}
          {map.issue && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{map.issue}</p>}
          {!map.active && <button type="button" disabled={!map.available || !catalog.robotOnline || Boolean(switchingMapId)} onClick={() => setSelectedMap(map)} className="mt-4 min-h-10 w-full rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400">{switchingMapId === map.id ? copy.switching : copy.switchMap}</button>}
          <div className="mt-2 grid grid-cols-3 gap-2"><button type="button" disabled={!catalog.robotOnline || operationBusy} onClick={() => openManagement("metadata", map)} className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700 disabled:opacity-50">{actions.editDetails}</button><button type="button" disabled={map.active || !catalog.robotOnline || operationBusy} onClick={() => openManagement("rename", map)} className="min-h-10 rounded-xl border border-slate-200 px-2 text-xs font-bold text-slate-700 disabled:opacity-50">{actions.renameMap}</button><button type="button" disabled={map.active || !catalog.robotOnline || operationBusy} onClick={() => openManagement("delete", map)} className="min-h-10 rounded-xl border border-rose-200 px-2 text-xs font-bold text-rose-700 disabled:opacity-50">{actions.deleteMap}</button></div>
          {map.active && <p className="mt-2 text-xs text-slate-400">{actions.activeProtected}</p>}
        </li>)}</ul>}
        {catalog && <p className="mt-4 text-xs text-slate-400">{copy.received}: {formatDate(catalog.receivedAt, locale)}</p>}
        {catalog && !catalog.robotOnline && <p className="mt-3 text-xs text-amber-700">{copy.idleRequired}</p>}
      </section>
    </div>
    <MapSwitchDialog
      map={selectedMap}
      title={copy.confirmTitle}
      body={copy.confirmBody}
      cancel={copy.cancel}
      confirm={copy.confirmSwitch}
      closeLabel={copy.closeDialog}
      onCancel={() => setSelectedMap(undefined)}
      onConfirm={() => void switchMap()}
    />
    <MapManageDialog map={managedMap} mode={manageMode} busy={operationBusy} name={mapName} building={building} floor={floor} area={areaDescription} newMapId={newMapId} copy={actions} onName={setMapName} onBuilding={setBuilding} onFloor={setFloor} onArea={setAreaDescription} onMapId={setNewMapId} onCancel={() => { if (!operationBusy) { setManagedMap(undefined); setManageMode(undefined); } }} onConfirm={() => void applyManagement()} />
  </>;
}

function Summary({ label, value, tone }: { label: string; value: string; tone: "blue" | "emerald" | "rose" | "slate" | "violet" }) {
  const tones = { blue: "bg-blue-50 text-blue-700", emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", slate: "bg-slate-100 text-slate-700", violet: "bg-violet-50 text-violet-700" };
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p><p className={`mt-3 inline-flex rounded-xl px-3 py-2 text-sm font-bold ${tones[tone]}`}>{value}</p></article>;
}

function MapManageDialog({ map, mode, busy, name, building, floor, area, newMapId, copy, onName, onBuilding, onFloor, onArea, onMapId, onCancel, onConfirm }: { map?: RobotMapRecord; mode?: "metadata" | "rename" | "delete"; busy: boolean; name: string; building: string; floor: string; area: string; newMapId: string; copy: (typeof mapManagementActionsText)[keyof typeof mapManagementActionsText]; onName: (value: string) => void; onBuilding: (value: string) => void; onFloor: (value: string) => void; onArea: (value: string) => void; onMapId: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const cancelRef = useRef(onCancel);
  useEffect(() => { cancelRef.current = onCancel; }, [onCancel]);
  useEffect(() => {
    if (!map || !mode) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled])") ?? []);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); document.body.style.overflow = previousOverflow; restoreRef.current?.focus(); };
  }, [map, mode]);
  if (!map || !mode) return null;
  const title = mode === "metadata" ? copy.metadataTitle : mode === "rename" ? copy.renameTitle : copy.deleteTitle;
  const valid = mode === "metadata" ? Boolean(name.trim()) : mode === "rename" ? /^[A-Za-z0-9_.-]{1,120}$/.test(newMapId) && newMapId !== map.id : true;
  const fieldClass = "mt-1 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onCancel(); }}><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="map-manage-title" className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="map-manage-title" className="text-xl font-black text-slate-950">{title}</h2><p className="mt-1 font-mono text-xs text-slate-500">{map.id}</p></div><button type="button" disabled={busy} aria-label={copy.closeDialog} onClick={onCancel} className="grid size-10 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button></div>
    <form className="mt-5 space-y-4" onSubmit={(event) => { event.preventDefault(); if (valid && !busy) onConfirm(); }}>
      {mode === "metadata" && <><label className="block text-sm font-semibold text-slate-700">{copy.name}<input autoComplete="off" maxLength={160} value={name} onChange={(event) => onName(event.target.value)} className={fieldClass} /></label><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold text-slate-700">{copy.building}<input autoComplete="off" maxLength={120} value={building} onChange={(event) => onBuilding(event.target.value)} className={fieldClass} /></label><label className="block text-sm font-semibold text-slate-700">{copy.floor}<input autoComplete="off" maxLength={80} value={floor} onChange={(event) => onFloor(event.target.value)} className={fieldClass} /></label></div><label className="block text-sm font-semibold text-slate-700">{copy.area}<textarea maxLength={240} rows={3} value={area} onChange={(event) => onArea(event.target.value)} className={`${fieldClass} py-3`} /></label></>}
      {mode === "rename" && <label className="block text-sm font-semibold text-slate-700">{copy.mapId}<input autoComplete="off" maxLength={120} pattern="[A-Za-z0-9_.-]+" value={newMapId} onChange={(event) => onMapId(event.target.value)} className={fieldClass} /><span className="mt-1 block text-xs font-normal text-slate-500">{copy.mapIdHelp}</span></label>}
      {mode === "delete" && <p className="rounded-2xl bg-rose-50 p-4 text-sm leading-6 text-rose-800">{copy.deleteBody}</p>}
      <div className="grid grid-cols-2 gap-3 pt-2"><button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 font-bold text-slate-700 disabled:opacity-50">{copy.cancel}</button><button type="submit" disabled={!valid || busy} className={`min-h-11 rounded-xl font-bold text-white disabled:opacity-50 ${mode === "delete" ? "bg-rose-600" : "bg-blue-600"}`}>{mode === "metadata" ? copy.save : mode === "rename" ? copy.renameMap : copy.deleteMap}</button></div>
    </form>
  </section></div>;
}

function MapSwitchDialog({ map, title, body, cancel, confirm, closeLabel, onCancel, onConfirm }: { map?: RobotMapRecord; title: string; body: string; cancel: string; confirm: string; closeLabel: string; onCancel: () => void; onConfirm: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const onCancelRef = useRef(onCancel);

  useEffect(() => { onCancelRef.current = onCancel; }, [onCancel]);

  useEffect(() => {
    if (!map) return;
    restoreRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusable = () => Array.from(panel?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onCancelRef.current(); return; }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      restoreRef.current?.focus();
    };
  }, [map]);

  if (!map) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}><section ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="map-switch-title" aria-describedby="map-switch-description" className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><h2 id="map-switch-title" className="text-xl font-black text-slate-950">{title}</h2><p className="mt-2 font-semibold text-blue-700">{map.name}</p></div><button type="button" aria-label={closeLabel} onClick={onCancel} className="grid size-10 place-items-center rounded-full text-xl text-slate-500 hover:bg-slate-100">×</button></div><p id="map-switch-description" className="mt-4 text-sm leading-6 text-slate-600">{body}</p><div className="mt-6 grid grid-cols-2 gap-3"><button type="button" onClick={onCancel} className="min-h-11 rounded-xl border border-slate-200 font-bold text-slate-700">{cancel}</button><button type="button" onClick={onConfirm} className="min-h-11 rounded-xl bg-blue-600 font-bold text-white">{confirm}</button></div></section></div>;
}
