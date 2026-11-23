import type { LatLng } from "./api";

export interface Bounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export function boundsOf(points: LatLng[]): Bounds | null {
  if (points.length === 0) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
  };
}

/** Maps a coordinate to x/y inside a width x height box, north up, with padding. */
export function project(
  p: LatLng,
  b: Bounds,
  width: number,
  height: number,
  pad = 20,
): { x: number; y: number } {
  const spanLng = b.maxLng - b.minLng || 1;
  const spanLat = b.maxLat - b.minLat || 1;
  const x =
    b.maxLng === b.minLng ? width / 2 : pad + ((p.lng - b.minLng) / spanLng) * (width - 2 * pad);
  const y =
    b.maxLat === b.minLat ? height / 2 : pad + ((b.maxLat - p.lat) / spanLat) * (height - 2 * pad);
  return { x, y };
}
