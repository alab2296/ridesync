import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import { PgRideRepository } from "../src/rides/repository.js";
import { createTestDb } from "./helpers/testDb.js";

const pickup = { lat: 24.8607, lng: 67.0011 };
const dropoff = { lat: 24.9056, lng: 67.0822 };

describe("cancel, start and complete a ride", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let users: PgUserRepository;
  let drivers: PgDriverRepository;
  let rides: PgRideRepository;
  let counter = 0;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    users = new PgUserRepository(db.pool);
    drivers = new PgDriverRepository(db.pool);
    rides = new PgRideRepository(db.pool);
    app = buildApp({ LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) }, { users, rides });
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
  /** A passenger, a driver and a ride in the given state. */
  async function setup(assigned: boolean) {
    const passenger = await newUser("passenger");
    const driver = await newUser("driver");
    await drivers.setAvailability(driver.id, "online");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });
    if (assigned) await rides.accept(ride.id, driver.id);
    return { passenger, driver, ride };
  }
  const call = (action: string, rideId: string, token: string, payload?: object) =>
    app.inject({
      method: "POST",
      url: `/rides/${rideId}/${action}`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  const driverStatus = async (id: string) =>
    (await db.pool.query("select status from drivers where user_id = $1", [id])).rows[0].status;

  it("lets the passenger cancel a ride nobody has taken", async () => {
    const { passenger, ride } = await setup(false);
    const res = await call("cancel", ride.id, passenger.token, { reason: "changed my mind" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ride).toMatchObject({ status: "CANCELLED", cancelReason: "changed my mind" });
  });

  it("frees the driver when an assigned ride is cancelled", async () => {
    const { passenger, driver, ride } = await setup(true);
    expect(await driverStatus(driver.id)).toBe("busy");
    const res = await call("cancel", ride.id, passenger.token);
    expect(res.statusCode).toBe(200);
    expect(await driverStatus(driver.id)).toBe("online");
  });

  it("lets the assigned driver cancel too", async () => {
    const { driver, ride } = await setup(true);
    const res = await call("cancel", ride.id, driver.token);
    expect(res.statusCode).toBe(200);
    expect(await driverStatus(driver.id)).toBe("online");
  });

  it("hides rides from people who are not part of them", async () => {
    const { ride } = await setup(true);
    const stranger = await newUser("passenger");
    const res = await call("cancel", ride.id, stranger.token);
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("RIDE_NOT_FOUND");
  });

  it("moves a ride through start and complete, and frees the driver at the end", async () => {
    const { driver, ride } = await setup(true);

    const started = await call("start", ride.id, driver.token);
    expect(started.statusCode).toBe(200);
    expect(started.json().ride.status).toBe("IN_PROGRESS");
    expect(await driverStatus(driver.id)).toBe("busy");

    const done = await call("complete", ride.id, driver.token);
    expect(done.statusCode).toBe(200);
    expect(done.json().ride.status).toBe("COMPLETED");
    expect(done.json().ride.completedAt).not.toBeNull();
    expect(await driverStatus(driver.id)).toBe("online");
  });

  it("refuses steps taken out of order", async () => {
    const { passenger, driver, ride } = await setup(true);

    const early = await call("complete", ride.id, driver.token);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe("INVALID_RIDE_STATE");

    await call("start", ride.id, driver.token);
    const twice = await call("start", ride.id, driver.token);
    expect(twice.statusCode).toBe(409);

    // Once the trip has begun the passenger can no longer cancel it.
    const late = await call("cancel", ride.id, passenger.token);
    expect(late.statusCode).toBe(409);
    expect(late.json().error.code).toBe("INVALID_RIDE_STATE");
  });

  it("refuses to change a finished ride", async () => {
    const { passenger, ride } = await setup(false);
    await call("cancel", ride.id, passenger.token);
    const again = await call("cancel", ride.id, passenger.token);
    expect(again.statusCode).toBe(409);
  });

  it("only lets the assigned driver start or complete", async () => {
    const { passenger, ride } = await setup(true);
    const otherDriver = await newUser("driver");
    expect((await call("start", ride.id, otherDriver.token)).statusCode).toBe(404);
    expect((await call("start", ride.id, passenger.token)).statusCode).toBe(403);
  });
});
