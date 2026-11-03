import type pg from "pg";

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
  requestedAt: Date;
  assignedAt: Date | null;
  completedAt: Date | null;
  cancelReason: string | null;
}

export class ActiveRideExistsError extends Error {
  constructor() {
    super("Passenger already has an active ride");
  }
}

export interface RideRepository {
  /** Throws ActiveRideExistsError if the passenger already has an active ride. */
  create(input: { passengerId: string; pickup: LatLng; dropoff: LatLng }): Promise<Ride>;
  findById(id: string): Promise<Ride | undefined>;
}

interface RideRow {
  id: string;
  passenger_id: string;
  driver_id: string | null;
  status: RideStatus;
  requested_at: Date;
  assigned_at: Date | null;
  completed_at: Date | null;
  cancel_reason: string | null;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_lat: number;
  dropoff_lng: number;
}

// Points are stored as PostGIS geography; read them back as plain lat/lng numbers.
const columns = `id, passenger_id, driver_id, status, requested_at, assigned_at, completed_at, cancel_reason,
  st_y(pickup::geometry) as pickup_lat, st_x(pickup::geometry) as pickup_lng,
  st_y(dropoff::geometry) as dropoff_lat, st_x(dropoff::geometry) as dropoff_lng`;

const toRide = (row: RideRow): Ride => ({
  id: row.id,
  passengerId: row.passenger_id,
  driverId: row.driver_id,
  status: row.status,
  pickup: { lat: row.pickup_lat, lng: row.pickup_lng },
  dropoff: { lat: row.dropoff_lat, lng: row.dropoff_lng },
  requestedAt: row.requested_at,
  assignedAt: row.assigned_at,
  completedAt: row.completed_at,
  cancelReason: row.cancel_reason,
});

export class PgRideRepository implements RideRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(input: { passengerId: string; pickup: LatLng; dropoff: LatLng }): Promise<Ride> {
    try {
      const { rows } = await this.pool.query<RideRow>(
        `insert into rides (passenger_id, pickup, dropoff)
         values ($1,
                 st_setsrid(st_makepoint($2, $3), 4326)::geography,
                 st_setsrid(st_makepoint($4, $5), 4326)::geography)
         returning ${columns}`,
        [
          input.passengerId,
          input.pickup.lng,
          input.pickup.lat,
          input.dropoff.lng,
          input.dropoff.lat,
        ],
      );
      return toRide(rows[0]!);
    } catch (err) {
      // 23505 = unique violation: one_active_ride_per_passenger
      if ((err as { code?: string }).code === "23505") throw new ActiveRideExistsError();
      throw err;
    }
  }

  async findById(id: string): Promise<Ride | undefined> {
    const { rows } = await this.pool.query<RideRow>(`select ${columns} from rides where id = $1`, [
      id,
    ]);
    return rows[0] && toRide(rows[0]);
  }
}
