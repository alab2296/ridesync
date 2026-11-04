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

describe("accepting a ride", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let users: PgUserRepository;
  let drivers: PgDriverRepository;
  let rides: PgRideRepository;
  let counter = 0;

  beforeAll(async () => {
    db = await createTestDb(30); // enough connections for every driver in a race to run at once
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
  const newOnlineDriver = async () => {
    const driver = await newUser("driver");
    await drivers.setAvailability(driver.id, "online");
    return driver;
  };
  const newRide = async () => {
    const passenger = await newUser("passenger");
    return rides.create({ passengerId: passenger.id, pickup, dropoff });
  };
  const accept = (rideId: string, token: string) =>
    app.inject({
      method: "POST",
      url: `/rides/${rideId}/accept`,
      headers: { authorization: `Bearer ${token}` },
    });
  const driverStatus = async (id: string) =>
    (await db.pool.query("select status from drivers where user_id = $1", [id])).rows[0].status;

  it("lets exactly one of many simultaneous drivers win, every time", async () => {
    for (let round = 0; round < 10; round++) {
      const ride = await newRide();
      const racers = await Promise.all(Array.from({ length: 20 }, newOnlineDriver));

      const results = await Promise.all(racers.map((d) => accept(ride.id, d.token)));

      const winners = results.filter((r) => r.statusCode === 200);
      const losers = results.filter((r) => r.statusCode !== 200);
      expect(winners).toHaveLength(1);
      expect(losers).toHaveLength(19);
      for (const loser of losers) {
        expect(loser.statusCode).toBe(409);
        expect(loser.json().error.code).toBe("RIDE_TAKEN");
      }

      // The database agrees with the winner's response, and only the winner is busy.
      const winnerId = winners[0]!.json().ride.driverId as string;
      const after = await rides.findById(ride.id);
      expect(after).toMatchObject({ status: "ASSIGNED", driverId: winnerId });
      const statuses = await Promise.all(racers.map((d) => driverStatus(d.id)));
      expect(statuses.filter((s) => s === "busy")).toHaveLength(1);
      expect(await driverStatus(winnerId)).toBe("busy");
    }
  });

  it("will not let one driver take two rides at once", async () => {
    const driver = await newOnlineDriver();
    const [rideA, rideB] = [await newRide(), await newRide()];

    const results = await Promise.all([
      accept(rideA.id, driver.token),
      accept(rideB.id, driver.token),
    ]);

    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 409]);
    const loser = results.find((r) => r.statusCode === 409)!;
    expect(loser.json().error.code).toBe("DRIVER_NOT_AVAILABLE");
    const states = [
      (await rides.findById(rideA.id))!.status,
      (await rides.findById(rideB.id))!.status,
    ];
    expect(states.sort()).toEqual(["ASSIGNED", "SEARCHING"]);
  });

  it("refuses a driver who is offline and leaves the ride waiting", async () => {
    const offline = await newUser("driver");
    const ride = await newRide();
    const res = await accept(ride.id, offline.token);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("DRIVER_NOT_AVAILABLE");
    expect((await rides.findById(ride.id))!.status).toBe("SEARCHING");
  });

  it("tells a late driver the ride is taken, and the first driver can see it", async () => {
    const [first, late] = [await newOnlineDriver(), await newOnlineDriver()];
    const ride = await newRide();
    expect((await accept(ride.id, first.token)).statusCode).toBe(200);

    const res = await accept(ride.id, late.token);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("RIDE_TAKEN");
    expect(await driverStatus(late.id)).toBe("online"); // the loser stays available

    const read = await app.inject({
      method: "GET",
      url: `/rides/${ride.id}`,
      headers: { authorization: `Bearer ${first.token}` },
    });
    expect(read.json().ride).toMatchObject({ status: "ASSIGNED", driverId: first.id });
  });

  it("handles unknown rides, bad ids and the wrong role", async () => {
    const driver = await newOnlineDriver();
    const passenger = await newUser("passenger");
    expect((await accept("00000000-0000-0000-0000-000000000000", driver.token)).statusCode).toBe(
      404,
    );
    expect((await accept("not-a-uuid", driver.token)).statusCode).toBe(400);
    expect((await accept((await newRide()).id, passenger.token)).statusCode).toBe(403);
    expect(await driverStatus(driver.id)).toBe("online"); // failed attempts leave no trace
  });
});
