import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import { RedisLocationStore } from "../src/location/store.js";
import { Matcher } from "../src/rides/matcher.js";
import { createTestDb } from "./helpers/testDb.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const pickup = { lat: 48.5734, lng: 13.4579 };

describe("matcher", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let redis: Redis;
  let locations: RedisLocationStore;
  let matcher: Matcher;
  let rideId: string;
  let n = 0;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    redis = new Redis(redisUrl, { db: 14 });
    locations = new RedisLocationStore(redis, 30);
    matcher = new Matcher(locations, new PgDriverRepository(db.pool));
  });
  beforeEach(async () => {
    await redis.flushdb();
    await db.pool.query("truncate users cascade");
    const passenger = await addUser("passenger");
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into rides (passenger_id, pickup, dropoff)
       values ($1, st_makepoint(13.4579, 48.5734)::geography, st_makepoint(13.46, 48.58)::geography)
       returning id`,
      [passenger],
    );
    rideId = rows[0]!.id;
  });
  afterAll(async () => {
    await redis.flushdb();
    redis.disconnect();
    await db.drop();
  });

  async function addUser(role: "passenger" | "driver") {
    n += 1;
    const { rows } = await db.pool.query<{ id: string }>(
      `insert into users (role, name, email, password_hash) values ($1, $2, $3, 'x') returning id`,
      [role, `u${n}`, `u${n}@example.com`],
    );
    return rows[0]!.id;
  }
  /** A driver with the given status, parked `dLat` degrees north of the pickup. */
  async function addDriver(status: "online" | "offline" | "busy", dLat: number) {
    const id = await addUser("driver");
    await db.pool.query("insert into drivers (user_id, status) values ($1, $2)", [id, status]);
    await locations.update(id, { lat: pickup.lat + dLat, lng: pickup.lng, heading: 0, ts: 1000 });
    return id;
  }

  it("returns online drivers near the pickup, nearest first", async () => {
    const far = await addDriver("online", 0.015);
    const near = await addDriver("online", 0.001);
    const found = await matcher.findCandidates(rideId, pickup);
    expect(found.map((d) => d.driverId)).toEqual([near, far]);
  });

  it("skips drivers that are offline or busy", async () => {
    await addDriver("offline", 0.001);
    await addDriver("busy", 0.002);
    const ok = await addDriver("online", 0.003);
    const found = await matcher.findCandidates(rideId, pickup);
    expect(found.map((d) => d.driverId)).toEqual([ok]);
  });

  it("skips drivers outside the radius", async () => {
    await addDriver("online", 0.2);
    expect(await matcher.findCandidates(rideId, pickup)).toEqual([]);
  });

  it("skips drivers already offered this ride, whatever their answer", async () => {
    const declined = await addDriver("online", 0.001);
    const fresh = await addDriver("online", 0.002);
    await db.pool.query(
      `insert into ride_offers (ride_id, driver_id, expires_at, result)
       values ($1, $2, now(), 'declined')`,
      [rideId, declined],
    );
    const found = await matcher.findCandidates(rideId, pickup);
    expect(found.map((d) => d.driverId)).toEqual([fresh]);
  });

  it("fills the list past unavailable drivers up to the limit", async () => {
    for (let i = 1; i <= 4; i++) await addDriver("busy", 0.0005 * i);
    const a = await addDriver("online", 0.004);
    const b = await addDriver("online", 0.005);
    const found = await matcher.findCandidates(rideId, pickup, { limit: 2 });
    expect(found.map((d) => d.driverId)).toEqual([a, b]);
  });

  it("returns nothing when no driver has a recent position", async () => {
    const id = await addUser("driver");
    await db.pool.query("insert into drivers (user_id, status) values ($1, 'online')", [id]);
    expect(await matcher.findCandidates(rideId, pickup)).toEqual([]);
  });
});
