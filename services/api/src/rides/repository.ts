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

export class RideNotFoundError extends Error {
  constructor() {
    super("Ride not found");
  }
}

/** Someone else got the ride first, or it is no longer waiting for a driver. */
export class RideTakenError extends Error {
  constructor() {
    super("Ride is no longer available");
  }
}

/** The driver is offline, or already busy with another ride. */
export class DriverNotAvailableError extends Error {
  constructor() {
    super("Driver is not available");
  }
}

/** The ride exists but is not in a state where this step is allowed. */
export class InvalidRideStateError extends Error {
  constructor() {
    super("Ride cannot be changed in its current state");
  }
}

export interface RideRepository {
  /** Throws ActiveRideExistsError if the passenger already has an active ride. */
  create(input: { passengerId: string; pickup: LatLng; dropoff: LatLng }): Promise<Ride>;
  findById(id: string): Promise<Ride | undefined>;
  /**
   * A driver takes a ride that is still SEARCHING. When several drivers try at
   * once, exactly one succeeds and the rest get RideTakenError.
   */
  accept(rideId: string, driverId: string): Promise<Ride>;
  /**
   * The passenger or the assigned driver cancels, before the trip starts.
   * Frees the driver. RideNotFoundError if the user is not part of the ride.
   */
  cancel(rideId: string, userId: string, reason?: string): Promise<Ride>;
  /** The assigned driver begins the trip: ASSIGNED or ARRIVING becomes IN_PROGRESS. */
  start(rideId: string, driverId: string): Promise<Ride>;
  /** The assigned driver ends the trip and becomes available again. */
  complete(rideId: string, driverId: string): Promise<Ride>;
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

  async accept(rideId: string, driverId: string): Promise<Ride> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");

      // The driver must be online. This also marks them busy, and it makes a
      // second accept by the same driver wait until this one has finished.
      const driver = await client.query(
        "update drivers set status = 'busy' where user_id = $1 and status = 'online'",
        [driverId],
      );
      if (driver.rowCount === 0) throw new DriverNotAvailableError();

      // The single conditional update that decides the winner (ADR 0002). The
      // database lets one update through and the others find the ride no
      // longer SEARCHING.
      const { rows } = await client.query<RideRow>(
        `update rides set driver_id = $2, status = 'ASSIGNED', assigned_at = now()
         where id = $1 and status = 'SEARCHING'
         returning ${columns}`,
        [rideId, driverId],
      );
      if (!rows[0]) {
        const exists = await client.query("select 1 from rides where id = $1", [rideId]);
        throw exists.rowCount ? new RideTakenError() : new RideNotFoundError();
      }

      await client.query("commit");
      return toRide(rows[0]);
    } catch (err) {
      await client.query("rollback");
      // Backstop: the unique index says a driver cannot hold two active rides.
      if ((err as { code?: string }).code === "23505") throw new DriverNotAvailableError();
      throw err;
    } finally {
      client.release();
    }
  }
  async cancel(rideId: string, userId: string, reason?: string): Promise<Ride> {
    return this.transition(
      rideId,
      userId,
      `update rides set status = 'CANCELLED', cancel_reason = $3
       where id = $1 and (passenger_id = $2 or driver_id = $2)
         and status in ('SEARCHING', 'ASSIGNED', 'ARRIVING')
       returning ${columns}`,
      [reason ?? null],
      "(passenger_id = $2 or driver_id = $2)",
    );
  }

  async start(rideId: string, driverId: string): Promise<Ride> {
    return this.transition(
      rideId,
      driverId,
      `update rides set status = 'IN_PROGRESS'
       where id = $1 and driver_id = $2 and status in ('ASSIGNED', 'ARRIVING')
       returning ${columns}`,
      [],
      "driver_id = $2",
    );
  }

  async complete(rideId: string, driverId: string): Promise<Ride> {
    return this.transition(
      rideId,
      driverId,
      `update rides set status = 'COMPLETED', completed_at = now()
       where id = $1 and driver_id = $2 and status = 'IN_PROGRESS'
       returning ${columns}`,
      [],
      "driver_id = $2",
    );
  }

  /**
   * Runs one conditional update that moves a ride to its next state. If no row
   * changed, a second query tells "not yours / not found" apart from "wrong
   * state". When the ride ends, the driver is freed in the same transaction.
   */
  private async transition(
    rideId: string,
    userId: string,
    sql: string,
    extra: unknown[],
    mayActOn: string,
  ): Promise<Ride> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const { rows } = await client.query<RideRow>(sql, [rideId, userId, ...extra]);
      if (!rows[0]) {
        const mine = await client.query(`select 1 from rides where id = $1 and ${mayActOn}`, [
          rideId,
          userId,
        ]);
        throw mine.rowCount ? new InvalidRideStateError() : new RideNotFoundError();
      }
      const ride = toRide(rows[0]);
      if ((ride.status === "CANCELLED" || ride.status === "COMPLETED") && ride.driverId) {
        await client.query(
          "update drivers set status = 'online' where user_id = $1 and status = 'busy'",
          [ride.driverId],
        );
      }
      await client.query("commit");
      return ride;
    } catch (err) {
      await client.query("rollback");
      throw err;
    } finally {
      client.release();
    }
  }
}
