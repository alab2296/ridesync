import type { LatLng, RideStatus } from "./api";

export function formatPoint(p: LatLng): string {
  return `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export const STATUS_OPTIONS: RideStatus[] = [
  "SEARCHING",
  "ASSIGNED",
  "ARRIVING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
];
