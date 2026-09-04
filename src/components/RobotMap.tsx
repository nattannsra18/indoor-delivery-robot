"use client";

import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { operationalText } from "@/lib/i18n";
import {
  calculateMapViewport, CanvasPoint, CanvasSize, MapViewport, worldToCanvas
} from "@/lib/mapGeometry";
import { framesAreCompatible } from "@/lib/navigationPath";
import {
  NavigationPathStatus, OccupancyGridMap, Station, TaskRoutePreview
} from "@/types";

export type StationSelectionMode = "pickup" | "destination";

type RobotMapProps = {
  interactive?: boolean;
  selectedPickupStationId?: string;
  selectedDestinationStationId?: string;
  selectionMode?: StationSelectionMode;
  onStationSelect?: (station: Station) => void;
  routePreview?: TaskRoutePreview;
};

const PATH_STATUS_LABEL: Record<"en" | "th", Record<NavigationPathStatus, string>> = {
  en: { live: "Live Nav2 path", waiting: "Waiting for path", unavailable: "Path unavailable", stale: "Path stale" },
  th: { live: "เส้นทาง Nav2 ปัจจุบัน", waiting: "กำลังรอเส้นทาง", unavailable: "ไม่มีเส้นทาง", stale: "เส้นทางล้าสมัย" },
};

export default function RobotMap({
  interactive = false,
  selectedPickupStationId,
  selectedDestinationStationId,
  selectionMode = "pickup",
  onStationSelect,
  routePreview
}: RobotMapProps) {
  const { locale, format } = useLocale();
  const copy = operationalText[locale];
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const occupancyCanvasRef = useRef<HTMLCanvasElement | undefined>(
    undefined
  );
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: 900, height: 540
  });
  const {
    occupancyMap, navigationPath, navigationPathStatus, robot,
    stations, activeTask, stationName
  } = useDeliveryApi();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateCanvasSize = () => {
      const width = Math.max(300, Math.floor(container.clientWidth));
      const naturalHeight = occupancyMap
        ? width * (occupancyMap.height / occupancyMap.width) : 420;
      const height = Math.round(Math.min(580, Math.max(360, naturalHeight)));
      setCanvasSize((current) =>
        current.width === width && current.height === height
          ? current : { width, height }
      );
    };
    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [occupancyMap]);

  useEffect(() => {
    occupancyCanvasRef.current = occupancyMap
      ? createOccupancyCanvas(occupancyMap) : undefined;
  }, [occupancyMap]);

  const renderablePath = useMemo(() =>
    occupancyMap && navigationPath && framesAreCompatible(
      occupancyMap.frameId, navigationPath.frameId
    ) ? navigationPath : undefined,
  [navigationPath, occupancyMap]);

  const displayedPathStatus: NavigationPathStatus = (
    navigationPath && occupancyMap && !framesAreCompatible(
      navigationPath.frameId, occupancyMap.frameId
    )
  ) ? "unavailable" : navigationPathStatus;

  useEffect(() => {
    const canvas = canvasRef.current;
    const mapCanvas = occupancyCanvasRef.current;
    if (!canvas || !occupancyMap || !mapCanvas) return;
    const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.round(canvasSize.width * pixelRatio);
    canvas.height = Math.round(canvasSize.height * pixelRatio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#e2e8f0";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);
    const viewport = calculateMapViewport(occupancyMap, canvasSize);
    drawOccupancyGrid(context, mapCanvas, viewport);
    if (routePreview && framesAreCompatible(occupancyMap.frameId, routePreview.frameId)) {
      drawNavigationPath(
        context, occupancyMap, viewport, routePreview.pickupPath, "#0891b2"
      );
      drawNavigationPath(
        context, occupancyMap, viewport, routePreview.deliveryPath, "#7c3aed"
      );
    } else {
      drawNavigationPath(
        context, occupancyMap, viewport, renderablePath?.poses ?? [], "#0ea5e9"
      );
    }
    stations.forEach((station) => drawStation(
      context, occupancyMap, viewport, station,
      {
        pickup: station.id === selectedPickupStationId,
        destination: station.id === selectedDestinationStationId,
        targeted: interactive && (
          selectionMode === "pickup"
            ? station.id === selectedPickupStationId
            : station.id === selectedDestinationStationId
        )
      },
      selectionMode
    ));
    const robotPoint = worldToCanvas(
      occupancyMap, viewport, robot.x, robot.y
    );
    if (robotPoint) drawRobot(context, occupancyMap, robotPoint, robot.yaw);
  }, [
    canvasSize, interactive, occupancyMap, renderablePath, robot,
    selectedDestinationStationId, selectedPickupStationId,
    routePreview, selectionMode, stations
  ]);

  function handleMapClick(event: MouseEvent<HTMLCanvasElement>) {
    if (!interactive || !occupancyMap || !onStationSelect) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const click = {
      x: (event.clientX - bounds.left) * (canvasSize.width / bounds.width),
      y: (event.clientY - bounds.top) * (canvasSize.height / bounds.height)
    };
    const viewport = calculateMapViewport(occupancyMap, canvasSize);
    const nearest = stations.map((station) => ({
      station,
      point: worldToCanvas(
        occupancyMap, viewport, station.x, station.y
      )
    })).filter((item): item is { station: Station; point: CanvasPoint } =>
      Boolean(item.point)
    ).map((item) => ({
      ...item,
      distance: Math.hypot(item.point.x - click.x, item.point.y - click.y)
    })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest && nearest.distance <= 20) onStationSelect(nearest.station);
  }

  if (!occupancyMap) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <div>
          <p className="font-semibold text-slate-700">{locale === "th" ? "กำลังรอแผนที่ ROS" : "Waiting for ROS map"}</p>
          <p className="mt-2 text-sm text-slate-500">
            {locale === "th" ? "ยังเลือกสถานีจากรายการได้ขณะไม่มีแผนที่ปัจจุบัน" : "Station dropdowns remain available while the live map is missing."}
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-700">
            {PATH_STATUS_LABEL[locale].unavailable}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div ref={containerRef} className="w-full overflow-hidden">
        <canvas
          ref={canvasRef}
          className={`block max-w-full ${interactive ? "cursor-pointer" : ""}`}
          aria-label={locale === "th" ? "แผนที่ ROS พร้อมเส้นทาง Nav2 สถานี และตำแหน่งหุ่นยนต์" : "ROS occupancy grid with live Nav2 path, stations and robot pose"}
          onClick={handleMapClick}
        />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
        {!routePreview && (
          <Legend color="#0ea5e9" label={PATH_STATUS_LABEL[locale][displayedPathStatus]} line />
        )}
        {routePreview && <Legend color="#0891b2" label={copy.mapPreviewPickup} line />}
        {routePreview && <Legend color="#7c3aed" label={copy.mapPreviewDestination} line />}
        <Legend color="#10b981" label={copy.station} />
        <Legend color="#06b6d4" label={locale === "th" ? "จุดรับ" : "Pickup"} />
        <Legend color="#8b5cf6" label={locale === "th" ? "จุดหมาย" : "Destination"} />
        <Legend color="#2563eb" label={locale === "th" ? "หุ่นยนต์" : "Robot"} />
      </div>
      {interactive && (
        <div className="border-t border-slate-200 bg-white px-4 py-3">
          <p className="mb-2 text-xs text-slate-500">
            {copy.selectStationHelp}
          </p>
          <div className="flex flex-wrap gap-2">
            {stations.map((station) => (
              <button
                key={station.id}
                type="button"
                onClick={() => onStationSelect?.(station)}
                disabled={
                  selectionMode === "pickup"
                    ? station.id === selectedDestinationStationId
                    : station.id === selectedPickupStationId
                }
                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                aria-label={format(copy.selectStation, { name: station.name, mode: selectionMode === "pickup" ? (locale === "th" ? "จุดรับ" : "pickup") : (locale === "th" ? "จุดหมาย" : "destination") })}
              >
                {station.id} · {station.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        <span>
          {format(copy.mapInfo, { width: occupancyMap.width, height: occupancyMap.height, resolution: occupancyMap.resolution.toFixed(3), revision: occupancyMap.revision })}
        </span>
        <span>
          {activeTask
            ? `${activeTask.id}: ${stationName(activeTask.pickupStationId)} → ${stationName(activeTask.destinationStationId)}`
            : format(copy.robotPose, { x: robot.x.toFixed(2), y: robot.y.toFixed(2), yaw: robot.yaw.toFixed(2) })}
        </span>
      </div>
    </div>
  );
}

function createOccupancyCanvas(map: OccupancyGridMap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = map.width;
  canvas.height = map.height;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const image = context.createImageData(map.width, map.height);
  for (let gridY = 0; gridY < map.height; gridY += 1) {
    const canvasY = map.height - 1 - gridY;
    for (let gridX = 0; gridX < map.width; gridX += 1) {
      const mapIndex = gridX + gridY * map.width;
      const canvasIndex = (gridX + canvasY * map.width) * 4;
      const [red, green, blue] = occupancyColor(map.data[mapIndex] ?? -1);
      image.data[canvasIndex] = red;
      image.data[canvasIndex + 1] = green;
      image.data[canvasIndex + 2] = blue;
      image.data[canvasIndex + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return canvas;
}

function drawOccupancyGrid(
  context: CanvasRenderingContext2D,
  mapCanvas: HTMLCanvasElement,
  viewport: MapViewport
) {
  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.18)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;
  context.imageSmoothingEnabled = true;
  context.drawImage(mapCanvas, viewport.x, viewport.y, viewport.width, viewport.height);
  context.restore();
  context.strokeStyle = "#94a3b8";
  context.strokeRect(viewport.x, viewport.y, viewport.width, viewport.height);
}

function occupancyColor(value: number): [number, number, number] {
  if (value < 0) return [203, 213, 225];
  if (value <= 10) return [255, 255, 255];
  if (value >= 65) return [51, 65, 85];
  const intensity = Math.round(255 - (value / 65) * 180);
  return [intensity, intensity, intensity];
}

function drawNavigationPath(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  viewport: MapViewport,
  poses: Array<{ x: number; y: number }>,
  color: string
) {
  const points = poses.map((pose) =>
    worldToCanvas(map, viewport, pose.x, pose.y, false)
  ).filter((point): point is CanvasPoint => Boolean(point));
  if (!points.length) return;
  context.save();
  context.beginPath();
  context.rect(viewport.x, viewport.y, viewport.width, viewport.height);
  context.clip();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 4;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.beginPath();
  if (points.length === 1) {
    context.arc(points[0].x, points[0].y, 5, 0, Math.PI * 2);
    context.fill();
  } else {
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
  }
  context.restore();
}

function drawStation(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  viewport: MapViewport,
  station: Station,
  state: { pickup: boolean; destination: boolean; targeted: boolean },
  selectionMode: StationSelectionMode
) {
  const point = worldToCanvas(map, viewport, station.x, station.y);
  if (!point) return;
  const color = state.pickup ? "#06b6d4"
    : state.destination ? "#8b5cf6" : "#10b981";
  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.24)";
  context.shadowBlur = 5;
  context.fillStyle = color;
  context.strokeStyle = state.targeted
    ? selectionMode === "pickup" ? "#155e75" : "#5b21b6"
    : "#ffffff";
  context.lineWidth = state.targeted ? 4 : 3;
  context.beginPath();
  context.arc(point.x, point.y, 13, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
  context.fillStyle = "#ffffff";
  context.font = "700 12px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(station.id, point.x, point.y + 0.5);
}

function drawRobot(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  point: CanvasPoint,
  yaw: number
) {
  const canvasYaw = -(yaw - map.originYaw);
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(point.x, point.y);
  context.lineTo(
    point.x + Math.cos(canvasYaw) * 28,
    point.y + Math.sin(canvasYaw) * 28
  );
  context.stroke();
  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.3)";
  context.shadowBlur = 7;
  context.fillStyle = "#2563eb";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(point.x, point.y, 16, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();
  context.fillStyle = "#ffffff";
  context.font = "800 14px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("R", point.x, point.y + 0.5);
}

function Legend({ color, label, line = false }: {
  color: string; label: string; line?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={line ? "h-1 w-5 rounded-full" : "h-2.5 w-2.5 rounded-sm"}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
