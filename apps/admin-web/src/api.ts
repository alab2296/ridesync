export type RideStatus =
  "SEARCHING" | "ASSIGNED" | "ARRIVING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Ride {
  id: string;
  passengerId: string;
  driverId: string | null;
  status: RideStatus;
  pickup: LatLng;
  dropoff: LatLng;
  requestedAt: string;
  assignedAt: string | null;
  completedAt: string | null;
  cancelReason: string | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...init, headers });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } }).error;
    throw new ApiError(res.status, err?.code ?? "UNKNOWN", err?.message ?? res.statusText);
  }
  return body as T;
}

export async function login(email: string, password: string): Promise<string> {
  const { token } = await request<{ token: string }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return token;
}

export async function listRides(
  token: string,
  filter: { status?: RideStatus; limit?: number; offset?: number } = {},
): Promise<Ride[]> {
  const params = new URLSearchParams();
  if (filter.status) params.set("status", filter.status);
  if (filter.limit !== undefined) params.set("limit", String(filter.limit));
  if (filter.offset !== undefined) params.set("offset", String(filter.offset));
  const query = params.size > 0 ? `?${params}` : "";
  const { rides } = await request<{ rides: Ride[] }>(`/admin/rides${query}`, {}, token);
  return rides;
}

export interface DriverLocation {
  id: string;
  name: string;
  status: "online" | "busy";
  location: LatLng & { heading: number; ts: number };
}

export async function listDriverLocations(token: string): Promise<DriverLocation[]> {
  const { drivers } = await request<{ drivers: DriverLocation[] }>(
    "/admin/drivers/locations",
    {},
    token,
  );
  return drivers;
}
