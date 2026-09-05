"use client";

import { FormEvent, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { stationText } from "@/lib/i18n";
import type { Station } from "@/types";

export default function StationsPage() {
  const { locale, format } = useLocale();
  const copy = stationText[locale];
  const {
    stations,
    mapMetadata,
    addStation,
    updateStation,
    updateMapMetadata,
    removeStation,
    backendOnline,
  } = useDeliveryApi();
  const [editingId, setEditingId] = useState<string>();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [instructions, setInstructions] = useState("");
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [yaw, setYaw] = useState("0");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mapName, setMapName] = useState("");
  const [building, setBuilding] = useState("");
  const [floor, setFloor] = useState("");
  const [areaDescription, setAreaDescription] = useState("");
  const [mapDirty, setMapDirty] = useState(false);
  const [mapBusy, setMapBusy] = useState(false);
  const [mapMessage, setMapMessage] = useState("");
  const [mapError, setMapError] = useState(false);

  useEffect(() => {
    if (!mapMetadata || mapDirty) return;
    setMapName(mapMetadata.mapName);
    setBuilding(mapMetadata.building);
    setFloor(mapMetadata.floor);
    setAreaDescription(mapMetadata.areaDescription ?? "");
  }, [mapDirty, mapMetadata]);

  function resetStationForm() {
    setEditingId(undefined);
    setName("");
    setDescription("");
    setLocation("");
    setInstructions("");
    setX("0");
    setY("0");
    setYaw("0");
  }

  function beginEdit(station: Station) {
    setEditingId(station.id);
    setName(station.name);
    setDescription(station.description ?? "");
    setLocation(station.location ?? "");
    setInstructions(station.instructions ?? "");
    setX(String(station.x));
    setY(String(station.y));
    setYaw(String(station.yaw));
    setMessage("");
  }

  async function handleSaveStation(event: FormEvent) {
    event.preventDefault();
    const parsedX = Number(x);
    const parsedY = Number(y);
    const parsedYaw = Number(yaw);
    if (!name.trim() || !Number.isFinite(parsedX) || !Number.isFinite(parsedY) || !Number.isFinite(parsedYaw)) {
      setIsError(true);
      setMessage(copy.validation);
      return;
    }

    setBusy(true);
    setMessage("");
    setIsError(false);
    const payload = {
      name: name.trim(),
      description: description.trim() || copy.defaultDescription,
      location: location.trim() || undefined,
      instructions: instructions.trim() || undefined,
      x: parsedX,
      y: parsedY,
      yaw: parsedYaw,
    };
    try {
      const saved = editingId
        ? await updateStation(editingId, payload)
        : await addStation(payload);
      setMessage(format(editingId ? copy.updated : copy.added, { name: saved.name, id: saved.id }));
      resetStationForm();
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : copy.addFailure);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveMap(event: FormEvent) {
    event.preventDefault();
    if (!mapName.trim() || !building.trim() || !floor.trim()) {
      setMapError(true);
      setMapMessage(copy.mapValidation);
      return;
    }
    setMapBusy(true);
    setMapError(false);
    setMapMessage("");
    try {
      await updateMapMetadata({
        mapName: mapName.trim(),
        building: building.trim(),
        floor: floor.trim(),
        areaDescription: areaDescription.trim() || undefined,
      });
      setMapDirty(false);
      setMapMessage(copy.mapSaved);
    } catch (err) {
      setMapError(true);
      setMapMessage(err instanceof Error ? err.message : copy.mapSaveFailure);
    } finally {
      setMapBusy(false);
    }
  }

  async function handleRemove(id: string) {
    setBusy(true);
    setMessage("");
    const result = await removeStation(id);
    setIsError(!result.ok);
    setMessage(result.message);
    if (result.ok && editingId === id) resetStationForm();
    setBusy(false);
  }

  return (
    <>
      <PageHeader title={copy.title} description={copy.description} />

      <form onSubmit={handleSaveMap} className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold text-slate-900">{copy.mapInformation}</h2>
            <p className="mt-1 text-sm text-slate-500">{copy.mapInformationHelp}</p>
          </div>
          <span className="self-start rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">{copy.userVisible}</span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input label={copy.mapName} value={mapName} onChange={(value) => { setMapName(value); setMapDirty(true); }} />
          <Input label={copy.building} value={building} onChange={(value) => { setBuilding(value); setMapDirty(true); }} />
          <Input label={copy.floor} value={floor} onChange={(value) => { setFloor(value); setMapDirty(true); }} />
          <Input label={copy.areaDescription} value={areaDescription} onChange={(value) => { setAreaDescription(value); setMapDirty(true); }} />
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div aria-live="polite">{mapMessage && <p className={`text-sm ${mapError ? "text-red-700" : "text-emerald-700"}`}>{mapMessage}</p>}</div>
          <button type="submit" disabled={mapBusy || !backendOnline || !mapDirty} className="min-h-11 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300">
            {mapBusy ? copy.save : copy.saveMapInformation}
          </button>
        </div>
      </form>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-semibold text-slate-900">{copy.configured}</h2>
          <div className="mt-4 grid gap-3">
            {stations.map((station) => (
              <article key={station.id} className={`rounded-xl border p-4 ${editingId === station.id ? "border-blue-300 bg-blue-50/30" : "border-slate-200"}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-xs font-bold text-blue-700">{station.id}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-900">{stationDisplayName(station)}</p>
                      {station.location && <p className="mt-1 text-sm text-slate-600">⌖ {station.location}</p>}
                      {station.instructions && <p className="mt-2 text-xs leading-5 text-slate-500">{copy.handoffInstructions}: {station.instructions}</p>}
                      <p className="mt-2 text-xs text-slate-400">{format(copy.pose, { x: station.x.toFixed(2), y: station.y.toFixed(2), yaw: station.yaw.toFixed(2) })}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => beginEdit(station)} disabled={busy || !backendOnline} className="min-h-10 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-blue-200 hover:text-blue-700 disabled:opacity-50">{copy.edit}</button>
                    <button type="button" onClick={() => void handleRemove(station.id)} disabled={busy || !backendOnline} className="min-h-10 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">{copy.remove}</button>
                  </div>
                </div>
              </article>
            ))}
            {stations.length === 0 && <p className="py-6 text-sm text-slate-500">{copy.empty}</p>}
          </div>
        </section>

        <form onSubmit={handleSaveStation} className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-semibold text-slate-900">{editingId ? copy.editStation : copy.add}</h2>
            {editingId && <button type="button" onClick={resetStationForm} className="text-sm font-semibold text-slate-500 hover:text-slate-900">{copy.cancelEdit}</button>}
          </div>
          <p className="mt-1 text-sm text-slate-500">{copy.persisted}</p>
          <div className="mt-5 grid gap-4">
            <Input label={copy.stationName} value={name} onChange={setName} />
            <Input label={copy.stationDescription} value={description} onChange={setDescription} />
            <Input label={copy.stationLocation} value={location} onChange={setLocation} />
            <TextArea label={copy.handoffInstructions} value={instructions} onChange={setInstructions} />
            <div className="grid gap-3 sm:grid-cols-3">
              <Input label="X" value={x} onChange={setX} inputMode="decimal" />
              <Input label="Y" value={y} onChange={setY} inputMode="decimal" />
              <Input label="Yaw" value={yaw} onChange={setYaw} inputMode="decimal" />
            </div>
            <button type="submit" disabled={busy || !backendOnline} className="min-h-11 rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
              {busy ? copy.save : (editingId ? copy.saveChanges : copy.addAction)}
            </button>
            <div aria-live="polite">{message && <p className={`rounded-xl p-3 text-sm leading-6 ${isError ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{message}</p>}</div>
          </div>
        </form>
      </div>
    </>
  );
}

function Input({ label, value, onChange, inputMode }: { label: string; value: string; onChange: (value: string) => void; inputMode?: "decimal" }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-slate-700">{label}</span><input value={value} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} className="min-w-0 rounded-xl border border-slate-300 px-3 py-3 outline-none ring-blue-500 transition focus:ring-2" /></label>;
}

function TextArea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="grid gap-2"><span className="text-sm font-semibold text-slate-700">{label}</span><textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} className="min-w-0 resize-y rounded-xl border border-slate-300 px-3 py-3 outline-none ring-blue-500 transition focus:ring-2" /></label>;
}

function stationDisplayName(station: Station) {
  return station.description ? `${station.name} — ${station.description}` : station.name;
}
