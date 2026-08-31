"use client";

// High-DPI ROS OccupancyGrid renderer with aspect-ratio correction.

import { useEffect, useMemo, useRef, useState } from "react";
import { useDeliveryApi } from "@/context/ApiDeliveryContext";
import { OccupancyGridMap, Station } from "@/types";

type CanvasPoint = {
  x: number;
  y: number;
};

type MapViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

type CanvasSize = {
  width: number;
  height: number;
};

const MAP_PADDING = 18;

export default function RobotMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [canvasSize, setCanvasSize] = useState<CanvasSize>({
    width: 900,
    height: 540
  });

  const {
    occupancyMap,
    robot,
    stations,
    activeTask,
    stationName
  } = useDeliveryApi();

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasSize = () => {
      const width = Math.max(300, Math.floor(container.clientWidth));
      const naturalHeight = occupancyMap
        ? width * (occupancyMap.height / occupancyMap.width)
        : 420;
      const height = Math.round(
        Math.min(580, Math.max(360, naturalHeight))
      );

      setCanvasSize((current) => {
        if (current.width === width && current.height === height) {
          return current;
        }
        return { width, height };
      });
    };

    updateCanvasSize();
    const observer = new ResizeObserver(updateCanvasSize);
    observer.observe(container);

    return () => observer.disconnect();
  }, [occupancyMap]);

  const targetStation = useMemo(() => {
    if (!activeTask) return undefined;

    const targetId =
      activeTask.status === "GOING_TO_PICKUP" ||
      activeTask.status === "WAITING_FOR_LOADING"
        ? activeTask.pickupStationId
        : activeTask.destinationStationId;

    return stations.find((station) => station.id === targetId);
  }, [activeTask, stations]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !occupancyMap) return;

    const devicePixelRatio = Math.max(
      1,
      window.devicePixelRatio || 1
    );

    canvas.width = Math.round(canvasSize.width * devicePixelRatio);
    canvas.height = Math.round(canvasSize.height * devicePixelRatio);
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.setTransform(
      devicePixelRatio,
      0,
      0,
      devicePixelRatio,
      0,
      0
    );
    context.clearRect(0, 0, canvasSize.width, canvasSize.height);
    context.fillStyle = "#e2e8f0";
    context.fillRect(0, 0, canvasSize.width, canvasSize.height);

    const viewport = calculateMapViewport(
      occupancyMap,
      canvasSize
    );

    drawOccupancyGrid(context, occupancyMap, viewport);

    const robotPoint = worldToCanvas(
      occupancyMap,
      viewport,
      robot.x,
      robot.y
    );

    const targetPoint = targetStation
      ? worldToCanvas(
          occupancyMap,
          viewport,
          targetStation.x,
          targetStation.y
        )
      : undefined;

    if (robotPoint && targetPoint) {
      drawMissionLine(context, robotPoint, targetPoint);
    }

    stations.forEach((station) => {
      drawStation(context, occupancyMap, viewport, station);
    });

    if (robotPoint) {
      drawRobot(
        context,
        occupancyMap,
        robotPoint,
        robot.yaw
      );
    }
  }, [
    occupancyMap,
    robot,
    stations,
    targetStation,
    canvasSize
  ]);

  if (!occupancyMap) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
        <div>
          <p className="font-semibold text-slate-700">
            Waiting for ROS map
          </p>
          <p className="mt-2 text-sm text-slate-500">
            Start Nav2 and amr_web_bridge to publish /map.
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
          className="block max-w-full"
          aria-label="ROS occupancy grid with robot and stations"
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-600">
        <Legend color="#334155" label="Occupied" />
        <Legend color="#ffffff" label="Free" bordered />
        <Legend color="#cbd5e1" label="Unknown" />
        <Legend color="#10b981" label="Station" />
        <Legend color="#2563eb" label="Robot" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-4 py-2 text-xs text-slate-500">
        <span>
          Map {occupancyMap.width}×{occupancyMap.height} ·{" "}
          {occupancyMap.resolution.toFixed(3)} m/cell · revision{" "}
          {occupancyMap.revision}
        </span>
        <span>
          {activeTask
            ? `${activeTask.id}: ${stationName(activeTask.pickupStationId)} → ${stationName(activeTask.destinationStationId)}`
            : `Robot x=${robot.x.toFixed(2)}, y=${robot.y.toFixed(2)}, yaw=${robot.yaw.toFixed(2)}`}
        </span>
      </div>
    </div>
  );
}

function calculateMapViewport(
  map: OccupancyGridMap,
  canvas: CanvasSize
): MapViewport {
  const availableWidth = Math.max(1, canvas.width - MAP_PADDING * 2);
  const availableHeight = Math.max(
    1,
    canvas.height - MAP_PADDING * 2
  );
  const scale = Math.min(
    availableWidth / map.width,
    availableHeight / map.height
  );
  const width = map.width * scale;
  const height = map.height * scale;

  return {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height,
    scale
  };
}

function drawOccupancyGrid(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  viewport: MapViewport
) {
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = map.width;
  mapCanvas.height = map.height;

  const mapContext = mapCanvas.getContext("2d");
  if (!mapContext) return;

  const image = mapContext.createImageData(map.width, map.height);

  for (let gridY = 0; gridY < map.height; gridY += 1) {
    const canvasY = map.height - 1 - gridY;

    for (let gridX = 0; gridX < map.width; gridX += 1) {
      const mapIndex = gridX + gridY * map.width;
      const canvasIndex = (gridX + canvasY * map.width) * 4;
      const occupancy = map.data[mapIndex] ?? -1;
      const [red, green, blue] = occupancyColor(occupancy);

      image.data[canvasIndex] = red;
      image.data[canvasIndex + 1] = green;
      image.data[canvasIndex + 2] = blue;
      image.data[canvasIndex + 3] = 255;
    }
  }

  mapContext.putImageData(image, 0, 0);

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.18)";
  context.shadowBlur = 10;
  context.shadowOffsetY = 3;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    mapCanvas,
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height
  );
  context.restore();

  context.save();
  context.strokeStyle = "#94a3b8";
  context.lineWidth = 1;
  context.strokeRect(
    viewport.x,
    viewport.y,
    viewport.width,
    viewport.height
  );
  context.restore();
}

function occupancyColor(value: number): [number, number, number] {
  if (value < 0) return [203, 213, 225];
  if (value <= 10) return [255, 255, 255];
  if (value >= 65) return [51, 65, 85];

  const intensity = Math.round(255 - (value / 65) * 180);
  return [intensity, intensity, intensity];
}

function worldToCanvas(
  map: OccupancyGridMap,
  viewport: MapViewport,
  worldX: number,
  worldY: number
): CanvasPoint | undefined {
  const deltaX = worldX - map.originX;
  const deltaY = worldY - map.originY;
  const cosine = Math.cos(map.originYaw);
  const sine = Math.sin(map.originYaw);
  const gridX =
    (cosine * deltaX + sine * deltaY) / map.resolution;
  const gridY =
    (-sine * deltaX + cosine * deltaY) / map.resolution;

  if (
    gridX < 0 ||
    gridY < 0 ||
    gridX >= map.width ||
    gridY >= map.height
  ) {
    return undefined;
  }

  return {
    x: viewport.x + gridX * viewport.scale,
    y: viewport.y + (map.height - 1 - gridY) * viewport.scale
  };
}

function drawMissionLine(
  context: CanvasRenderingContext2D,
  start: CanvasPoint,
  end: CanvasPoint
) {
  context.save();
  context.strokeStyle = "rgba(37, 99, 235, 0.8)";
  context.lineWidth = 3;
  context.setLineDash([9, 7]);
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawStation(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  viewport: MapViewport,
  station: Station
) {
  const point = worldToCanvas(
    map,
    viewport,
    station.x,
    station.y
  );
  if (!point) return;

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.24)";
  context.shadowBlur = 5;
  context.shadowOffsetY = 2;
  context.fillStyle = "#10b981";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(point.x, point.y, 13, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = "#ffffff";
  context.font = "700 12px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(station.id, point.x, point.y + 0.5);
  context.restore();
}

function drawRobot(
  context: CanvasRenderingContext2D,
  map: OccupancyGridMap,
  point: CanvasPoint,
  yaw: number
) {
  const canvasYaw = -(yaw - map.originYaw);
  const headingLength = 28;
  const headingX = point.x + Math.cos(canvasYaw) * headingLength;
  const headingY = point.y + Math.sin(canvasYaw) * headingLength;

  context.save();
  context.strokeStyle = "#f59e0b";
  context.lineWidth = 4;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(point.x, point.y);
  context.lineTo(headingX, headingY);
  context.stroke();
  context.restore();

  context.save();
  context.shadowColor = "rgba(15, 23, 42, 0.3)";
  context.shadowBlur = 7;
  context.shadowOffsetY = 2;
  context.fillStyle = "#2563eb";
  context.strokeStyle = "#ffffff";
  context.lineWidth = 4;
  context.beginPath();
  context.arc(point.x, point.y, 16, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.restore();

  context.save();
  context.fillStyle = "#ffffff";
  context.font = "800 14px ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("R", point.x, point.y + 0.5);
  context.restore();
}

function Legend({
  color,
  label,
  bordered = false
}: {
  color: string;
  label: string;
  bordered?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`h-2.5 w-2.5 rounded-sm ${
          bordered ? "border border-slate-300" : ""
        }`}
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
