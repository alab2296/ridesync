import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { WebSocket } from "ws";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import { RedisLocationStore } from "../src/location/store.js";
import { PgRideRepository } from "../src/rides/repository.js";
import { createTestDb } from "./helpers/testDb.js";

const pickup = { lat: 24.8607, lng: 67.0011 };
const dropoff = { lat: 24.9056, lng: 67.0822 };
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

type Msg = { type: string; data: Record<string, unknown> };

describe("driver_location stream to the passenger", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let redis: Redis;
  let app: FastifyInstance;
  let users: PgUserRepository;
  let drivers: PgDriverRepository;
  let rides: PgRideRepository;
  let base: string;
  let counter = 0;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    redis = new Redis(redisUrl, { db: 15 });
    users = new PgUserRepository(db.pool);
    drivers = new PgDriverRepository(db.pool);
    rides = new PgRideRepository(db.pool);
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      { users, rides, locations: new RedisLocationStore(redis, 30) },
    );
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    await redis.flushdb();
  });
  afterAll(async () => {
    await app.close();
    await redis.flushdb();
    redis.disconnect();
    await db.drop();
  });

  async function newUser(role: "passenger" | "driver") {
    const user = await users.create({
      role,
      name: role,
      email: `${role}${++counter}@example.com`,
      passwordHash: "h",
    });
    return { id: user.id, token: app.jwt.sign({ sub: user.id, role }) };
  }

  /** Opens a socket, waits for ready, and records every message after that. */
  async function connect(token: string) {
    const ws = new WebSocket(`${base}/ws?token=${token}`);
    const received: Msg[] = [];
    await new Promise((resolve) => ws.once("message", resolve));
    ws.on("message", (m) => received.push(JSON.parse(m.toString())));
    return { ws, received };
  }
  const waitFor = async (check: () => boolean) => {
    for (let i = 0; i < 100 && !check(); i++) await new Promise((r) => setTimeout(r, 20));
  };
  const reading = (ts: number) => ({ lat: 24.87, lng: 67.02, heading: 45, ts });

  it("forwards the driver's position to the passenger of the active ride", async () => {
    const passenger = await newUser("passenger");
    const driver = await newUser("driver");
    await drivers.setAvailability(driver.id, "online");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });
    await rides.accept(ride.id, driver.id);

    const p = await connect(passenger.token);
    const d = await connect(driver.token);
    d.ws.send(JSON.stringify({ type: "location", data: reading(1000) }));
    await waitFor(() => p.received.length > 0);

    expect(p.received).toEqual([
      { type: "driver_location", data: { rideId: ride.id, ...reading(1000) } },
    ]);
    p.ws.close();
    d.ws.close();
  });

  it("sends nothing to a passenger whose driver has no active ride", async () => {
    const passenger = await newUser("passenger");
    const driver = await newUser("driver");
    await drivers.setAvailability(driver.id, "online");
    await rides.create({ passengerId: passenger.id, pickup, dropoff });

    const p = await connect(passenger.token);
    const d = await connect(driver.token);
    const acks: Msg[] = [];
    d.ws.on("message", (m) => acks.push(JSON.parse(m.toString())));
    d.ws.send(JSON.stringify({ type: "location", data: reading(1000) }));
    await waitFor(() => acks.length > 0);

    expect(p.received).toEqual([]);
    p.ws.close();
    d.ws.close();
  });

  it("stops forwarding once the ride is completed", async () => {
    const passenger = await newUser("passenger");
    const driver = await newUser("driver");
    await drivers.setAvailability(driver.id, "online");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });
    await rides.accept(ride.id, driver.id);
    await rides.start(ride.id, driver.id);
    await rides.complete(ride.id, driver.id);

    const p = await connect(passenger.token);
    const d = await connect(driver.token);
    const acks: Msg[] = [];
    d.ws.on("message", (m) => acks.push(JSON.parse(m.toString())));
    d.ws.send(JSON.stringify({ type: "location", data: reading(1000) }));
    await waitFor(() => acks.length > 0);

    expect(p.received).toEqual([]);
    p.ws.close();
    d.ws.close();
  });
});
