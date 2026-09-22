"use client";

import { MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { useLocale } from "@/context/LocaleContext";
import { operationalText } from "@/lib/i18n";
import {
  calculateMapViewport, canvasToWorld, CanvasPoint, CanvasSize, MapViewport, worldToCanvas
} from "@/lib/mapGeometry";
import { framesAreCompatible } from "@/lib/navigationPath";
import {
  NavigationPathStatus, OccupancyGridMap, Robot, Station, TaskRoutePreview
} from "@/types";

export type StationSelectionMode = "pickup" | "destination";

type RobotMapProps = {
  interactive?: boolean;
  selectedPickupStationId?: string;
  selectedDestinationStationId?: string;
  selectionMode?: StationSelectionMode;
  onStationSelect?: (station: Station) => void;
  routePreview?: TaskRoutePreview;
  smoothMotion?: boolean;
  showStations?: boolean;
  showStationButtons?: boolean;
  showTechnicalDetails?: boolean;
  stationsOverride?: Station[];
  draftPose?: { x: number; y: number; yaw: number };
  draftPoseLabel?: string;
  onMapPointSelect?: (point: { x: number; y: number }) => void;
  onMapPoseSelect?: (pose: { x: number; y: number; yaw: number }) => void;
  mapAriaLabel?: string;
  viewportSize?: "default" | "dashboard";
};

const PATH_STATUS_LABEL: Record<"en" | "th", Record<NavigationPathStatus, string>> = {
  en: { live: "Live Nav2 path", waiting: "Waiting for path", unavailable: "Path unavailable", stale: "Path stale" },
  th: { live: "เส้นทาง Nav2 ปัจจุบัน", waiting: "กำลังรอเส้นทาง", unavailable: "ไม่มีเส้นทาง", stale: "เส้นทางล้าสมัย" },
};
const USER_PATH_STATUS_LABEL: Record<"en" | "th", Record<NavigationPathStatus, string>> = {
  en: { live: "Current route", waiting: "Waiting for route", unavailable: "Route unavailable", stale: "Route updating" },
  th: { live: "เส้นทางปัจจุบัน", waiting: "กำลังรอเส้นทาง", unavailable: "ไม่มีเส้นทาง", stale: "กำลังอัปเดตเส้นทาง" },
};

export default function RobotMap({
  interactive = false,
  selectedPickupStationId,
  selectedDestinationStationId,
  selectionMode = "pickup",
  onStationSelect,
  routePreview,
  smoothMotion = false,
  showStations = true,
  showStationButtons = true,
  showTechnicalDetails = true,
  stationsOverride,
  draftPose,
  draftPoseLabel,
  onMapPointSelect,
  onMapPoseSelect,
  mapAriaLabel,
  viewportSize = "default",
}: RobotMapProps) {
  const { locale, format } = useLocale();
  const copy = operationalText[locale];
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseGesture = useRef<{ pointerId: number; x: number; y: number; yaw: number } | undefined>(undefined);
  const panGesture = useRef<{ pointerId: number; clientX: number; clientY: number; startX: number; startY: number; moved: boolean } | undefined>(undefined);
  const suppressClick = useRef(false);
  const occupancyCanvasRef = useRef<HTMLCanvasElement | undefined>(
    undefined
  );
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: 900, height: 540
  });
  const [view, setView] = useState({ zoom: 1, rotation: 0, x: 0, y: 0 });
  const {
    occupancyMap, navigationPath, navigationPathStatus, robot: liveRobot,
    stations: contextStations, activeTask, stationName
  } = useDeliveryApi();
  const stations = stationsOverride ?? contextStations;
  const robot = useSmoothRobotPose(liveRobot, smoothMotion);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateCanvasSize = () => {
      const width = Math.max(300, Math.floor(container.clientWidth));
      const minimumHeight = viewportSize === "dashboard" ? 760 : 360;
      const maximumHeight = viewportSize === "dashboard" ? 840 : 580;
      const naturalHeight = occupancyMap
        ? width * (occupancyMap.height / occupancyMap.width) : minimumHeight;
      const height = Math.round(Math.min(maximumHeight, Math.max(minimumHeight, naturalHeight)));
      setCanvasSize((current) =>
        current.width === width && current.height === height
          ? current : { width, height }
      );
    };
    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [occupancyMap, viewportSize]);

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
    const pixelWidth = Math.round(canvasSize.width * pixelRatio);
    const pixelHeight = Math.round(canvasSize.height * pixelRatio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.save();
    context.translate(canvasSize.width / 2 + view.x, canvasSize.height / 2 + view.y);
    context.rotate(view.rotation * Math.PI / 180);
    context.scale(view.zoom, view.zoom);
    context.translate(-canvasSize.width / 2, -canvasSize.height / 2);
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
    if (showStations) {
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
    }
    const robotPoint = worldToCanvas(
      occupancyMap, viewport, robot.x, robot.y
    );
    if (robotPoint) drawRobot(context, occupancyMap, robotPoint, robot.yaw);
    if (draftPose) {
      const draftPoint = worldToCanvas(occupancyMap, viewport, draftPose.x, draftPose.y);
      if (draftPoint) drawDraftPose(context, occupancyMap, draftPoint, draftPose.yaw);
    }
    context.restore();
  }, [
    canvasSize, interactive, occupancyMap, renderablePath, robot,
    selectedDestinationStationId, selectedPickupStationId,
    routePreview, selectionMode, showStations, stations, draftPose, view
  ]);

  function handleMapClick(event: MouseEvent<HTMLCanvasElement>) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (onMapPoseSelect) return;
    if ((!interactive && !onMapPointSelect) || !occupancyMap) return;
    const click = canvasPointFromClient(event.currentTarget, event.clientX, event.clientY);
    const viewport = calculateMapViewport(occupancyMap, canvasSize);
    if (onMapPointSelect) {
      const point = canvasToWorld(occupancyMap, viewport, click.x, click.y);
      if (point) onMapPointSelect(point);
      return;
    }
    if (!onStationSelect) return;
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

  function worldPointFromPointer(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!occupancyMap) return undefined;
    const viewport = calculateMapViewport(occupancyMap, canvasSize);
    const point = canvasPointFromClient(event.currentTarget, event.clientX, event.clientY);
    return canvasToWorld(
      occupancyMap,
      viewport,
      point.x,
      point.y,
    );
  }

  function canvasPointFromClient(canvas: HTMLCanvasElement, clientX: number, clientY: number) {
    const bounds = canvas.getBoundingClientRect();
    const screenX = (clientX - bounds.left) * (canvasSize.width / bounds.width);
    const screenY = (clientY - bounds.top) * (canvasSize.height / bounds.height);
    const centerX = canvasSize.width / 2;
    const centerY = canvasSize.height / 2;
    const radians = view.rotation * Math.PI / 180;
    const dx = screenX - centerX - view.x;
    const dy = screenY - centerY - view.y;
    return {
      x: (Math.cos(radians) * dx + Math.sin(radians) * dy) / view.zoom + centerX,
      y: (-Math.sin(radians) * dx + Math.cos(radians) * dy) / view.zoom + centerY,
    };
  }

  function handlePosePointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!onMapPoseSelect) {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      panGesture.current = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startX: view.x,
        startY: view.y,
        moved: false,
      };
      return;
    }
    const point = worldPointFromPointer(event);
    if (!point) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const yaw = draftPose?.yaw ?? robot.yaw ?? 0;
    poseGesture.current = { pointerId: event.pointerId, ...point, yaw };
    onMapPoseSelect({ ...point, yaw });
  }

  function handlePosePointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pan = panGesture.current;
    if (pan && pan.pointerId === event.pointerId) {
      const dx = event.clientX - pan.clientX;
      const dy = event.clientY - pan.clientY;
      if (Math.hypot(dx, dy) > 4) pan.moved = true;
      setView((current) => ({ ...current, x: pan.startX + dx, y: pan.startY + dy }));
      return;
    }
    const start = poseGesture.current;
    if (!start || start.pointerId !== event.pointerId || !onMapPoseSelect) return;
    const point = worldPointFromPointer(event);
    if (!point) return;
    const distance = Math.hypot(point.x - start.x, point.y - start.y);
    const yaw = distance < 0.04 ? start.yaw : Math.atan2(point.y - start.y, point.x - start.x);
    onMapPoseSelect({ x: start.x, y: start.y, yaw });
  }

  function finishPoseGesture(event: React.PointerEvent<HTMLCanvasElement>) {
    const pan = panGesture.current;
    if (pan?.pointerId === event.pointerId) {
      suppressClick.current = pan.moved;
      panGesture.current = undefined;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      return;
    }
    if (poseGesture.current?.pointerId !== event.pointerId) return;
    handlePosePointerMove(event);
    poseGesture.current = undefined;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function zoomBy(amount: number) {
    setView((current) => ({ ...current, zoom: Math.min(4, Math.max(0.6, Number((current.zoom + amount).toFixed(2)))) }));
  }

  function rotateBy(degrees: number) {
    setView((current) => ({ ...current, rotation: (current.rotation + degrees + 360) % 360 }));
  }

  function resetView() {
    setView({ zoom: 1, rotation: 0, x: 0, y: 0 });
  }

  if (!occupancyMap) {
    return (
      <div className={`grid place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center ${viewportSize === "dashboard" ? "min-h-[760px]" : "min-h-[360px]"}`}>
        <div>
          <p className="font-semibold text-slate-700">{showTechnicalDetails
            ? (locale === "th" ? "กำลังรอแผนที่ ROS" : "Waiting for ROS map")
            : (locale === "th" ? "กำลังรอแผนที่" : "Waiting for map")}</p>
          <p className="mt-2 text-sm text-slate-500">
            {locale === "th" ? "ยังเลือกสถานีจากรายการได้ขณะไม่มีแผนที่ปัจจุบัน" : "Station dropdowns remain available while the live map is missing."}
          </p>
          <p className="mt-2 text-xs font-semibold text-amber-700">
            {(showTechnicalDetails ? PATH_STATUS_LABEL : USER_PATH_STATUS_LABEL)[locale].unavailable}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <div ref={containerRef} className="relative w-full overflow-hidden bg-slate-100">
        <canvas
          ref={canvasRef}
          tabIndex={interactive || onMapPointSelect || onMapPoseSelect ? 0 : undefined}
          className={`block max-w-full touch-none ${onMapPoseSelect ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          aria-label={mapAriaLabel ?? (showTechnicalDetails
            ? (locale === "th" ? `แผนที่ ROS พร้อมเส้นทาง Nav2${showStations ? " สถานี" : ""} และตำแหน่งหุ่นยนต์` : `ROS occupancy grid with live Nav2 path${showStations ? ", stations" : ""} and robot pose`)
            : (locale === "th" ? "แผนที่จัดส่งพร้อมเส้นทาง สถานี และตำแหน่งหุ่นยนต์" : "Delivery map with route, stations and robot position"))}
          onClick={handleMapClick}
          onPointerDown={handlePosePointerDown}
          onPointerMove={handlePosePointerMove}
          onPointerUp={finishPoseGesture}
          onPointerCancel={finishPoseGesture}
          onWheel={(event) => {
            event.preventDefault();
            zoomBy(event.deltaY < 0 ? 0.15 : -0.15);
          }}
        />
        <div className="absolute right-4 top-4 z-10 w-12 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-lg shadow-slate-900/15 backdrop-blur" aria-label={locale === "th" ? "เครื่องมือควบคุมแผนที่" : "Map view controls"}>
          <div className="flex flex-col gap-1" aria-label={locale === "th" ? "ซูม" : "Zoom"}>
            <MapControlButton onClick={() => zoomBy(0.2)} label={locale === "th" ? "ซูมเข้า" : "Zoom in"}><ZoomInIcon /></MapControlButton>
            <MapControlButton onClick={() => zoomBy(-0.2)} label={locale === "th" ? "ซูมออก" : "Zoom out"}><ZoomOutIcon /></MapControlButton>
          </div>
          <div className="my-1.5 h-px bg-slate-200" />
          <div className="flex flex-col gap-1" aria-label={locale === "th" ? "หมุนแผนที่" : "Rotate map"}>
            <MapControlButton onClick={() => rotateBy(-15)} label={locale === "th" ? "หมุนทวนเข็มนาฬิกา 15 องศา" : "Rotate counterclockwise 15 degrees"}><RotateIcon /></MapControlButton>
            <MapControlButton onClick={() => rotateBy(15)} label={locale === "th" ? "หมุนตามเข็มนาฬิกา 15 องศา" : "Rotate clockwise 15 degrees"}><span className="inline-flex -scale-x-100"><RotateIcon /></span></MapControlButton>
          </div>
          <div className="my-1.5 h-px bg-slate-200" />
          <MapControlButton onClick={resetView} label={locale === "th" ? "จัดกึ่งกลางและรีเซ็ตมุมมอง" : "Fit and reset map view"}><FocusIcon /></MapControlButton>
        </div>
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-full border border-slate-200 bg-white/95 px-3 py-1.5 font-mono text-[10px] font-semibold text-slate-600 shadow-sm backdrop-blur">
          {Math.round(view.zoom * 100)}% · {Math.round(view.rotation)}°
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
        {!routePreview && (
          <Legend color="#0ea5e9" label={(showTechnicalDetails ? PATH_STATUS_LABEL : USER_PATH_STATUS_LABEL)[locale][displayedPathStatus]} line />
        )}
        {routePreview && <Legend color="#0891b2" label={copy.mapPreviewPickup} line />}
        {routePreview && <Legend color="#7c3aed" label={copy.mapPreviewDestination} line />}
        {showStations && <Legend color="#10b981" label={copy.station} />}
        {showStations && <Legend color="#06b6d4" label={locale === "th" ? "จุดรับ" : "Pickup"} />}
        {showStations && <Legend color="#8b5cf6" label={locale === "th" ? "จุดหมาย" : "Destination"} />}
        <Legend color="#2563eb" label={locale === "th" ? "หุ่นยนต์" : "Robot"} />
        {draftPose && <Legend color="#d97706" label={draftPoseLabel ?? (locale === "th" ? "ตำแหน่งเริ่มต้น" : "Initial pose")} />}
      </div>
      {interactive && showStationButtons && (
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
      {showTechnicalDetails && <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        <span>
          {format(copy.mapInfo, { width: occupancyMap.width, height: occupancyMap.height, resolution: occupancyMap.resolution.toFixed(3), revision: occupancyMap.revision })}
        </span>
        <span>
          {activeTask
            ? `${activeTask.id}: ${stationName(activeTask.pickupStationId)} → ${stationName(activeTask.destinationStationId)}`
            : format(copy.robotPose, { x: robot.x.toFixed(2), y: robot.y.toFixed(2), yaw: robot.yaw.toFixed(2) })}
        </span>
      </div>}
    </div>
  );
}

function useSmoothRobotPose(robot: Robot, enabled: boolean): Robot {
  const poseRef = useRef(robot);
  const [displayed, setDisplayed] = useState(robot);

  useEffect(() => {
    const target: Robot = {
      id: robot.id,
      name: robot.name,
      online: robot.online,
      battery: robot.battery,
      batterySource: robot.batterySource,
      state: robot.state,
      x: robot.x,
      y: robot.y,
      yaw: robot.yaw,
      currentTaskId: robot.currentTaskId,
      lastSeen: robot.lastSeen
    };
    if (!enabled) {
      poseRef.current = target;
      setDisplayed(target);
      return;
    }

    const from = poseRef.current;
    const startedAt = performance.now();
    const duration = 900;
    const yawDelta = Math.atan2(
      Math.sin(target.yaw - from.yaw),
      Math.cos(target.yaw - from.yaw)
    );
    let frame = 0;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const next = {
        ...target,
        x: from.x + (target.x - from.x) * eased,
        y: from.y + (target.y - from.y) * eased,
        yaw: from.yaw + yawDelta * eased
      };
      poseRef.current = next;
      setDisplayed(next);
      if (progress < 1) frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [
    enabled,
    robot.battery,
    robot.batterySource,
    robot.currentTaskId,
    robot.id,
    robot.lastSeen,
    robot.name,
    robot.online,
    robot.state,
    robot.x,
    robot.y,
    robot.yaw
  ]);

  return displayed;
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
      image.data[canvasIndex + 3] = map.data[mapIndex] < 0 ? 0 : 255;
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
  // Occupancy cells are semantic map data, not a photo. Nearest-neighbour
  // scaling keeps wall boundaries readable at every zoom level.
  context.imageSmoothingEnabled = false;
  context.drawImage(mapCanvas, viewport.x, viewport.y, viewport.width, viewport.height);
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

function drawDraftPose(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  point: CanvasPoint,
  yaw: number
) {
  const canvasYaw = -(yaw - map.originYaw);
  context.save();
  context.strokeStyle = "#d97706";
  context.fillStyle = "#fffbeb";
  context.lineWidth = 3;
  context.setLineDash([5, 4]);
  context.beginPath();
  context.arc(point.x, point.y, 14, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.setLineDash([]);
  context.beginPath();
  context.moveTo(point.x, point.y);
  context.lineTo(point.x + Math.cos(canvasYaw) * 34, point.y + Math.sin(canvasYaw) * 34);
  context.stroke();
  context.restore();
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

function MapControlButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} aria-label={label} title={label} className="grid h-9 w-9 place-items-center rounded-xl border border-transparent bg-slate-50 text-slate-700 transition hover:border-blue-100 hover:bg-blue-600 hover:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 active:scale-95">{children}</button>;
}

function ZoomInIcon() {
  return <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>;
}

function ZoomOutIcon() {
  return <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M5 12h14" /></svg>;
}

function RotateIcon() {
  return <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 12a8 8 0 1 0 2.35-5.65"/><path d="M4 4v5h5"/></svg>;
}

function FocusIcon() {
  return <svg aria-hidden="true" className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 4H4v4M16 4h4v4M20 16v4h-4M4 16v4h4"/><circle cx="12" cy="12" r="3"/></svg>;
}
