import type pg from "pg";

export type OfferResult = "pending" | "accepted" | "declined" | "expired";

export interface Offer {
  id: string;
  rideId: string;
  driverId: string;
  offeredAt: Date;
  expiresAt: Date;
  result: OfferResult;
}

/** The ride is not waiting for a driver, or already has an offer out. */
export class OfferNotPossibleError extends Error {
  constructor() {
    super("Ride cannot be offered right now");
  }
}

/** There is no open offer for this driver: wrong ride, already answered, or timed out. */
export class OfferNotFoundError extends Error {
  constructor() {
    super("No open offer for this driver");
  }
}

export interface OfferRepository {
  /** Offers a SEARCHING ride to one driver for ttlSeconds. */
  create(rideId: string, driverId: string, ttlSeconds: number): Promise<Offer>;
  /** The driver turns down their open offer. */
  decline(rideId: string, driverId: string): Promise<Offer>;
  /** Marks every pending offer whose time ran out as expired and returns them. */
  expireDue(): Promise<Offer[]>;
}

interface OfferRow {
  id: string;
  ride_id: string;
  driver_id: string;
  offered_at: Date;
  expires_at: Date;
  result: OfferResult;
}

const columns = "id, ride_id, driver_id, offered_at, expires_at, result";

const toOffer = (row: OfferRow): Offer => ({
  id: row.id,
  rideId: row.ride_id,
  driverId: row.driver_id,
  offeredAt: row.offered_at,
  expiresAt: row.expires_at,
  result: row.result,
});

export class PgOfferRepository implements OfferRepository {
  constructor(private readonly pool: pg.Pool) {}

  async create(rideId: string, driverId: string, ttlSeconds: number): Promise<Offer> {
    try {
      // The select makes sure the ride is still SEARCHING; the unique indexes
      // reject a second pending offer, and a repeat offer to the same driver.
      const { rows } = await this.pool.query<OfferRow>(
        `insert into ride_offers (ride_id, driver_id, expires_at)
         select r.id, $2, now() + make_interval(secs => $3)
         from rides r where r.id = $1 and r.status = 'SEARCHING'
         returning ${columns}`,
        [rideId, driverId, ttlSeconds],
      );
      if (!rows[0]) throw new OfferNotPossibleError();
      return toOffer(rows[0]);
    } catch (err) {
      // 23505 = unique violation
      if ((err as { code?: string }).code === "23505") throw new OfferNotPossibleError();
      throw err;
    }
  }

  async decline(rideId: string, driverId: string): Promise<Offer> {
    const { rows } = await this.pool.query<OfferRow>(
      `update ride_offers set result = 'declined'
       where ride_id = $1 and driver_id = $2 and result = 'pending' and expires_at > now()
       returning ${columns}`,
      [rideId, driverId],
    );
    if (!rows[0]) throw new OfferNotFoundError();
    return toOffer(rows[0]);
  }

  async expireDue(): Promise<Offer[]> {
    const { rows } = await this.pool.query<OfferRow>(
      `update ride_offers set result = 'expired'
       where result = 'pending' and expires_at <= now()
       returning ${columns}`,
    );
    return rows.map(toOffer);
  }
}
