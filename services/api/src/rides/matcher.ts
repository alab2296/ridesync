import type { DriverRepository } from "../drivers/repository.js";
import type { LocationStore, NearbyDriver } from "../location/store.js";

export interface MatcherOptions {
  /** How far from the pickup point to look, in metres. */
  radiusM?: number;
  /** The most candidates to return. */
  limit?: number;
}

/**
 * Picks the drivers worth offering a ride to. Redis knows who is close and
 * recently seen; Postgres knows who is online and who was already asked.
 */
export class Matcher {
  constructor(
    private readonly locations: LocationStore,
    private readonly drivers: DriverRepository,
    private readonly defaults: Required<MatcherOptions> = { radiusM: 3000, limit: 5 },
  ) {}

  /** Candidates for a ride, nearest first. */
  async findCandidates(
    rideId: string,
    pickup: { lat: number; lng: number },
    options: MatcherOptions = {},
  ): Promise<NearbyDriver[]> {
    const { radiusM, limit } = { ...this.defaults, ...options };
    // Ask Redis for more than we need: some of the nearest may be busy or
    // already asked, and we still want to fill the list from the next ones.
    const near = await this.locations.nearby(pickup.lat, pickup.lng, radiusM, limit * 4);
    const ok = new Set(
      await this.drivers.offerable(
        near.map((d) => d.driverId),
        rideId,
      ),
    );
    return near.filter((d) => ok.has(d.driverId)).slice(0, limit);
  }
}
