import type pg from "pg";

export type DriverStatus = "offline" | "online" | "busy";

/** Thrown when a driver in the middle of a ride tries to change availability. */
export class DriverBusyError extends Error {
  constructor() {
    super("Driver is busy with a ride");
  }
}

export interface DriverRepository {
  /**
   * Sets the driver's availability and returns the new status. Safe to repeat.
   * Throws DriverBusyError if the driver is currently busy with a ride.
   */
  setAvailability(userId: string, status: "online" | "offline"): Promise<DriverStatus>;
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
}
