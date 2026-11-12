import type { Redis } from "ioredis";

export interface DriverLocation {
  lat: number;
  lng: number;
  heading: number;
  /** Time the driver's device took the reading, in milliseconds since the epoch. */
  ts: number;
}

export interface NearbyDriver {
  driverId: string;
  distanceM: number;
}

export interface LocationStore {
  /** Saves the latest position of a driver. Older readings (by ts) are ignored. */
  update(driverId: string, location: DriverLocation): Promise<boolean>;
  get(driverId: string): Promise<DriverLocation | null>;
  /** Drivers within radiusM metres of a point, nearest first. */
  nearby(lat: number, lng: number, radiusM: number, limit?: number): Promise<NearbyDriver[]>;
  remove(driverId: string): Promise<void>;
}

const GEO_KEY = "drivers:geo";
const locKey = (driverId: string) => `driver:loc:${driverId}`;

/**
 * Latest position per driver. The geo index answers "who is near this point";
 * a small hash per driver holds the full reading and carries the expiry. Geo
 * set members cannot expire on their own, so a driver whose hash has expired
 * is treated as gone and cleaned out of the index when a search finds it.
 */
export class RedisLocationStore implements LocationStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds = 30,
  ) {}

  async update(driverId: string, loc: DriverLocation): Promise<boolean> {
    // Compare-and-set on ts in one step, so two updates arriving out of order
    // cannot leave the older reading behind.
    const applied = await this.redis.eval(
      `local old = redis.call('HGET', KEYS[1], 'ts')
       if old and tonumber(old) >= tonumber(ARGV[4]) then return 0 end
       redis.call('HSET', KEYS[1], 'lat', ARGV[1], 'lng', ARGV[2], 'heading', ARGV[3], 'ts', ARGV[4])
       redis.call('EXPIRE', KEYS[1], ARGV[5])
       redis.call('GEOADD', KEYS[2], ARGV[2], ARGV[1], ARGV[6])
       return 1`,
      2,
      locKey(driverId),
      GEO_KEY,
      loc.lat,
      loc.lng,
      loc.heading,
      loc.ts,
      this.ttlSeconds,
      driverId,
    );
    return applied === 1;
  }

  async get(driverId: string): Promise<DriverLocation | null> {
    const h = await this.redis.hgetall(locKey(driverId));
    if (!h.ts) return null;
    return { lat: Number(h.lat), lng: Number(h.lng), heading: Number(h.heading), ts: Number(h.ts) };
  }

  async nearby(lat: number, lng: number, radiusM: number, limit = 20): Promise<NearbyDriver[]> {
    const found = (await this.redis.call(
      "GEOSEARCH",
      GEO_KEY,
      "FROMLONLAT",
      String(lng),
      String(lat),
      "BYRADIUS",
      String(radiusM),
      "m",
      "ASC",
      "WITHDIST",
    )) as [string, string][];

    const alive: NearbyDriver[] = [];
    for (const [driverId, dist] of found) {
      if (await this.redis.exists(locKey(driverId))) {
        alive.push({ driverId, distanceM: Number(dist) });
        if (alive.length === limit) break;
      } else {
        await this.redis.zrem(GEO_KEY, driverId);
      }
    }
    return alive;
  }

  async remove(driverId: string): Promise<void> {
    await this.redis.del(locKey(driverId));
    await this.redis.zrem(GEO_KEY, driverId);
  }
}
