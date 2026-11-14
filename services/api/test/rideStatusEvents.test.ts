import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import { PgRideRepository } from "../src/rides/repository.js";
import { Hub } from "../src/ws/hub.js";
import { createTestDb } from "./helpers/testDb.js";

const pickup = { lat: 24.8607, lng: 67.0011 };
const dropoff = { lat: 24.9056, lng: 67.0822 };

type Sent = { userId: string; type: string; data: Record<string, unknown> };

/** A hub that records what would have been pushed instead of using sockets. */
class RecordingHub extends Hub {
  sent: Sent[] = [];
  override send(userId: string, type: string, data: unknown): number {
    this.sent.push({ userId, type, data: data as Record<string, unknown> });
    return 1;
  }
}

describe("ride_status events", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let users: PgUserRepository;
  let drivers: PgDriverRepository;
  let rides: PgRideRepository;
  let hub: RecordingHub;
  let counter = 0;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    users = new PgUserRepository(db.pool);
    drivers = new PgDriverRepository(db.pool);
    rides = new PgRideRepository(db.pool);
    hub = new RecordingHub();
    app = buildApp({ LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) }, { users, rides, hub });
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
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
  async function setup(assigned: boolean) {
    const passenger = await newUser("passenger");
    const driver = await newUser("driver");
    await drivers.setAvailability(driver.id, "online");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });
    if (assigned) await rides.accept(ride.id, driver.id);
    hub.sent = [];
    return { passenger, driver, ride };
  }
  const call = (action: string, rideId: string, token: string) =>
    app.inject({
      method: "POST",
      url: `/rides/${rideId}/${action}`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("tells the passenger when a driver accepts", async () => {
    const { passenger, driver, ride } = await setup(false);
    expect((await call("accept", ride.id, driver.token)).statusCode).toBe(200);
    expect(hub.sent).toEqual([
      {
        userId: passenger.id,
        type: "ride_status",
        data: { rideId: ride.id, status: "ASSIGNED", driverId: driver.id },
      },
    ]);
  });

  it("tells the passenger when the trip starts and completes", async () => {
    const { passenger, driver, ride } = await setup(true);
    await call("start", ride.id, driver.token);
    await call("complete", ride.id, driver.token);
    expect(hub.sent.map((e) => [e.userId, e.type, e.data.status])).toEqual([
      [passenger.id, "ride_status", "IN_PROGRESS"],
      [passenger.id, "ride_status", "COMPLETED"],
    ]);
  });

  it("tells the other side when a ride is cancelled", async () => {
    const { passenger, driver, ride } = await setup(true);
    await call("cancel", ride.id, driver.token);
    expect(hub.sent.map((e) => e.userId)).toEqual([passenger.id]);
    expect(hub.sent[0]?.data.status).toBe("CANCELLED");

    const second = await setup(true);
    await call("cancel", second.ride.id, second.passenger.token);
    expect(hub.sent.map((e) => e.userId)).toEqual([second.driver.id]);
  });

  it("sends nothing when the step is refused", async () => {
    const { driver, ride } = await setup(true);
    await call("start", ride.id, driver.token);
    hub.sent = [];
    expect((await call("start", ride.id, driver.token)).statusCode).toBe(409);
    expect(hub.sent).toEqual([]);
  });
});
