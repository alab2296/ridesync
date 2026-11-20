import type pg from "pg";

export type DriverStatus = "offline" | "online" | "busy";

/** Thrown when a driver in the middle of a ride tries to change availability. */
export class DriverBusyError extends Error {
  constructor() {
    super("Driver is busy with a ride");
  }
}

export interface DriverSummary {
  id: string;
  name: string;
  status: DriverStatus;
  vehiclePlate: string | null;
  vehicleModel: string | null;
}

export interface DriverRepository {
  /**
   * Sets the driver's availability and returns the new status. Safe to repeat.
   * Throws DriverBusyError if the driver is currently busy with a ride.
   */
  setAvailability(userId: string, status: "online" | "offline"): Promise<DriverStatus>;
  /**
   * Of the given drivers, the ones that can be offered this ride: online, and
   * not already sent an offer for it (a driver gets one offer per ride).
   * The result keeps the order of driverIds.
   */
  offerable(driverIds: string[], rideId: string): Promise<string[]>;
  /** All drivers for the admin view, oldest account first, optionally of one status. */
  list(status?: DriverStatus): Promise<DriverSummary[]>;
}

export class PgDriverRepository implements DriverRepository {
  constructor(private readonly pool: pg.Pool) {}

  async setAvailability(userId: string, status: "online" | "offline"): Promise<DriverStatus> {
    // The drivers row is created the first time a driver goes online or offline.
    // The WHERE on the update leaves a busy driver untouched, so no row comes back.
    const { rows } = await this.pool.query<{ status: DriverStatus }>(
      `insert into drivers (user_id, status) values ($1, $2)
       on conflict (user_id) do update set status = excluded.status
         where drivers.status <> 'busy'
       returning status`,
      [userId, status],
    );
    if (!rows[0]) throw new DriverBusyError();
    return rows[0].status;
  }

  async offerable(driverIds: string[], rideId: string): Promise<string[]> {
    if (driverIds.length === 0) return [];
    const { rows } = await this.pool.query<{ user_id: string }>(
      `select d.user_id
       from drivers d
       where d.user_id = any($1::uuid[])
         and d.status = 'online'
         and not exists (
           select 1 from ride_offers o where o.ride_id = $2 and o.driver_id = d.user_id
         )`,
      [driverIds, rideId],
    );
    const ok = new Set(rows.map((r) => r.user_id));
    return driverIds.filter((id) => ok.has(id));
  }

  async list(status?: DriverStatus): Promise<DriverSummary[]> {
    const { rows } = await this.pool.query<{
      id: string;
      name: string;
      status: DriverStatus;
      vehicle_plate: string | null;
      vehicle_model: string | null;
    }>(
      `select d.user_id as id, u.name, d.status, d.vehicle_plate, d.vehicle_model
       from drivers d
       join users u on u.id = d.user_id
       where $1::driver_status is null or d.status = $1::driver_status
       order by u.created_at, u.id`,
      [status ?? null],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      vehiclePlate: r.vehicle_plate,
      vehicleModel: r.vehicle_model,
    }));
  }
}
