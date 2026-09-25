"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/context/LocaleContext";
import { WS_BASE_URL } from "@/lib/api";
import { dashboardOperationsText } from "@/lib/i18n";

const FRAME_HEADER_BYTES = 37;

type CameraMetrics = {
  fps: number;
  latencyMs: number | null;
};

function isCameraFrame(view: DataView) {
  return view.byteLength > FRAME_HEADER_BYTES
    && view.getUint8(0) === 0x49
    && view.getUint8(1) === 0x44
    && view.getUint8(2) === 0x52
    && view.getUint8(3) === 0x42
    && view.getUint8(4) === 1;
}

export default function LiveCamera({ enabled, robotId }: { enabled: boolean; robotId: string }) {
  const { locale } = useLocale();
  const copy = dashboardOperationsText[locale];
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [metrics, setMetrics] = useState<CameraMetrics>({ fps: 0, latencyMs: null });

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
    setMetrics({ fps: 0, latencyMs: null });
    if (!enabled || !robotId) return;

    const socket = new WebSocket(
      `${WS_BASE_URL}/ws/browser/robots/${encodeURIComponent(robotId)}/camera`,
    );
    socket.binaryType = "arraybuffer";
    let active = true;
    let sequence = 0;
    let metricStartedAt = performance.now();
    let renderedFrames = 0;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    function requestNextFrame() {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "next_frame", after_sequence: sequence }));
      }
    }

    socket.onopen = requestNextFrame;
    socket.onmessage = async (event) => {
      if (!active) return;
      if (!(event.data instanceof ArrayBuffer)) {
        setFailed(true);
        socket.close(4001, "Camera is temporarily unavailable");
        return;
      }

      const view = new DataView(event.data);
      if (!isCameraFrame(view)) {
        setFailed(true);
        socket.close(4002, "Unsupported camera frame");
        return;
      }

      sequence = Number(view.getBigUint64(5));
      const capturedAtNs = view.getBigUint64(21);
      const jpeg = event.data.slice(FRAME_HEADER_BYTES);
      try {
        const bitmap = await createImageBitmap(new Blob([jpeg], { type: "image/jpeg" }));
        if (!active) {
          bitmap.close();
          return;
        }
        const canvas = canvasRef.current;
        const context = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !context) throw new Error("Camera canvas is unavailable");
        context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        bitmap.close();
        setLoaded(true);
        setFailed(false);

        renderedFrames += 1;
        const now = performance.now();
        const elapsedMs = now - metricStartedAt;
        if (elapsedMs >= 500) {
          setMetrics({
            fps: Math.round((renderedFrames * 1000 / elapsedMs) * 10) / 10,
            latencyMs: capturedAtNs > BigInt(0)
              ? Math.max(0, Math.round(Date.now() - Number(capturedAtNs / BigInt(1_000_000))))
              : null,
          });
          metricStartedAt = now;
          renderedFrames = 0;
        }
        requestNextFrame();
      } catch {
        setFailed(true);
        socket.close(4003, "Camera frame could not be decoded");
      }
    };
    socket.onerror = () => setFailed(true);
    socket.onclose = () => {
      if (active) {
        setFailed(true);
        reconnectTimer = setTimeout(
          () => setAttempt((current) => current + 1),
          1_500,
        );
      }
    };

    return () => {
      active = false;
      if (reconnectTimer !== undefined) clearTimeout(reconnectTimer);
      socket.close(1000, "Camera view closed");
    };
  }, [attempt, enabled, robotId]);

  function retry() {
    setAttempt((current) => current + 1);
  }

  const metricText = loaded && metrics.fps > 0
    ? copy.cameraMetrics
      .replace("{fps}", metrics.fps.toFixed(1))
      .replace("{latency}", metrics.latencyMs === null ? "—" : String(metrics.latencyMs))
    : copy.cameraMeasuring;

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
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        aria-label={copy.cameraAlt}
        className={`absolute inset-0 h-full w-full ${loaded ? "opacity-100" : "opacity-0"}`}
      />
      {(!enabled || !loaded || failed) && <div className="absolute inset-0 grid place-items-center p-5 text-center">
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
      <span>{metricText}</span>
      <span>{copy.cameraTransport}</span>
    </div>
  </section>;
}
