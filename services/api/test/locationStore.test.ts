import { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RedisLocationStore } from "../src/location/store.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

describe("redis location store", () => {
  let redis: Redis;
  let store: RedisLocationStore;

  beforeAll(() => {
    // Database 15 keeps test keys apart from anything else in the local Redis.
    redis = new Redis(url, { db: 15 });
  });
  beforeEach(async () => {
    await redis.flushdb();
    store = new RedisLocationStore(redis, 30);
  });
  afterAll(async () => {
    await redis.flushdb();
    redis.disconnect();
  });

  const here = { lat: 48.5734, lng: 13.4579, heading: 90, ts: 1000 };

  it("saves and reads back the latest position", async () => {
    expect(await store.update("d1", here)).toBe(true);
    expect(await store.get("d1")).toEqual(here);
    expect(await store.get("nobody")).toBeNull();
  });

  it("ignores a reading that is older than the one stored", async () => {
    await store.update("d1", { ...here, ts: 2000, heading: 10 });
    expect(await store.update("d1", { ...here, ts: 1500, heading: 99 })).toBe(false);
    expect((await store.get("d1"))?.heading).toBe(10);
  });

  it("finds drivers by distance, nearest first, within the radius", async () => {
    await store.update("near", { ...here, lat: 48.5744 });
    await store.update("mid", { ...here, lat: 48.5834 });
    await store.update("far", { ...here, lat: 48.7 });
    const found = await store.nearby(here.lat, here.lng, 3000);
    expect(found.map((d) => d.driverId)).toEqual(["near", "mid"]);
    expect(found[0]!.distanceM).toBeLessThan(found[1]!.distanceM);
    expect(await store.nearby(here.lat, here.lng, 3000, 1)).toHaveLength(1);
  });

  it("moves a driver when a newer position arrives", async () => {
    await store.update("d1", here);
    await store.update("d1", { ...here, lat: 48.7, ts: 2000 });
    expect(await store.nearby(here.lat, here.lng, 1000)).toEqual([]);
  });

  it("drops a driver whose position has expired and cleans the index", async () => {
    const short = new RedisLocationStore(redis, 1);
    await short.update("d1", here);
    await new Promise((r) => setTimeout(r, 1200));
    expect(await short.get("d1")).toBeNull();
    expect(await short.nearby(here.lat, here.lng, 1000)).toEqual([]);
    expect(await redis.zcard("drivers:geo")).toBe(0);
  });

  it("removes a driver", async () => {
    await store.update("d1", here);
    await store.remove("d1");
    expect(await store.get("d1")).toBeNull();
    expect(await store.nearby(here.lat, here.lng, 1000)).toEqual([]);
  });
});
