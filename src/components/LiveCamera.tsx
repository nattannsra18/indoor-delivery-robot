"use client";
/* eslint-disable @next/next/no-img-element -- the camera is an authenticated MJPEG stream. */

import { useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { dashboardOperationsText } from "@/lib/i18n";

export default function LiveCamera({ enabled, robotId }: { enabled: boolean; robotId: string }) {
  const { locale } = useLocale();
  const copy = dashboardOperationsText[locale];
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const streamUrl = `/api/camera/stream?robotId=${encodeURIComponent(robotId)}&attempt=${attempt}`;

  function retry() {
    setLoaded(false);
    setFailed(false);
    setAttempt((current) => current + 1);
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
    <div className="flex items-start justify-between gap-3 p-4 pb-3">
      <div>
        <h2 className="font-bold text-slate-950">{copy.liveCamera}</h2>
        <p className="mt-1 text-xs leading-5 text-slate-500">{copy.cameraDescription}</p>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${loaded ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {loaded ? copy.cameraLive : enabled ? copy.cameraConnecting : copy.cameraPaused}
      </span>
    </div>
    <div className="relative aspect-[4/3] overflow-hidden bg-slate-950">
      {enabled && !failed && <img
        key={attempt}
        src={streamUrl}
        alt={copy.cameraAlt}
        className={`absolute inset-0 h-full w-full object-cover ${loaded ? "opacity-100" : "opacity-0"}`}
        onLoad={() => { setLoaded(true); setFailed(false); }}
        onError={() => setFailed(true)}
      />}
      {(!enabled || !loaded) && <div className="absolute inset-0 grid place-items-center p-5 text-center">
        <div>
          <span aria-hidden="true" className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white/10 text-white">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 10 20 7v10l-5-3" strokeLinejoin="round" /><rect x="3" y="6" width="12" height="12" rx="2" /></svg>
          </span>
          <p className="mt-3 text-sm font-semibold text-white">{failed ? copy.cameraUnavailable : enabled ? copy.cameraConnecting : copy.cameraPaused}</p>
          {failed && <button type="button" onClick={retry} className="mt-3 min-h-10 rounded-lg border border-white/25 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white">{copy.retryCamera}</button>}
        </div>
      </div>}
    </div>
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-slate-500">
      <span>{copy.cameraResolution}</span>
      <span>{copy.cameraTransport}</span>
    </div>
  </section>;
}
