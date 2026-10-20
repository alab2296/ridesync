/** Ride lifecycle. See docs/02-architecture.md. */
export const RIDE_STATUSES = [
  "SEARCHING",
  "ASSIGNED",
  "ARRIVING",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;

export type RideStatus = (typeof RIDE_STATUSES)[number];

const ALLOWED: Record<RideStatus, readonly RideStatus[]> = {
  SEARCHING: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["ARRIVING", "CANCELLED"],
  ARRIVING: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function canTransition(from: RideStatus, to: RideStatus): boolean {
  return ALLOWED[from].includes(to);
}
