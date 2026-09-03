import { OccupancyGridMap } from "@/types";

export type CanvasPoint = { x: number; y: number };
export type CanvasSize = { width: number; height: number };
export type MapViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export function calculateMapViewport(
  map: OccupancyGridMap,
  canvas: CanvasSize,
  padding = 18
): MapViewport {
  const availableWidth = Math.max(1, canvas.width - padding * 2);
  const availableHeight = Math.max(
    1,
    canvas.height - padding * 2
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

export function worldToCanvas(
  map: OccupancyGridMap,
  viewport: MapViewport,
  worldX: number,
  worldY: number,
  requireInside = true
): CanvasPoint | undefined {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldY)) {
    return undefined;
  }

  const deltaX = worldX - map.originX;
  const deltaY = worldY - map.originY;
  const cosine = Math.cos(map.originYaw);
  const sine = Math.sin(map.originYaw);
  const gridX =
    (cosine * deltaX + sine * deltaY) / map.resolution;
  const gridY =
    (-sine * deltaX + cosine * deltaY) / map.resolution;

  if (requireInside && (
    gridX < 0
    || gridY < 0
    || gridX >= map.width
    || gridY >= map.height
  )) {
    return undefined;
  }

  return {
    x: viewport.x + gridX * viewport.scale,
    y: viewport.y + (map.height - 1 - gridY) * viewport.scale
  };
}
