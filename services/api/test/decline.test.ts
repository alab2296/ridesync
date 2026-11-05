import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgOfferRepository } from "../src/rides/offers.js";
import { PgRideRepository } from "../src/rides/repository.js";
import { createTestDb } from "./helpers/testDb.js";

const pickup = { lat: 24.8607, lng: 67.0011 };
const dropoff = { lat: 24.9056, lng: 67.0822 };

describe("declining an offer", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let users: PgUserRepository;
  let rides: PgRideRepository;
  let offers: PgOfferRepository;
  let counter = 0;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    users = new PgUserRepository(db.pool);
    rides = new PgRideRepository(db.pool);
    offers = new PgOfferRepository(db.pool);
    app = buildApp({ LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) }, { users, rides, offers });
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
  const decline = (rideId: string, token: string) =>
    app.inject({
      method: "POST",
      url: `/rides/${rideId}/decline`,
      headers: { authorization: `Bearer ${token}` },
    });

  it("marks the open offer as declined", async () => {
    const driver = await newUser("driver");
    const passenger = await newUser("passenger");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });
    await offers.create(ride.id, driver.id, 30);

    const res = await decline(ride.id, driver.token);

    expect(res.statusCode).toBe(200);
    expect(res.json().offer).toEqual({ rideId: ride.id, result: "declined" });
  });

  it("answers 404 when the driver has no open offer", async () => {
    const driver = await newUser("driver");
    const passenger = await newUser("passenger");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });

    const res = await decline(ride.id, driver.token);

    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe("OFFER_NOT_FOUND");
  });

  it("does not let a driver decline someone else's offer", async () => {
    const owner = await newUser("driver");
    const other = await newUser("driver");
    const passenger = await newUser("passenger");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });
    await offers.create(ride.id, owner.id, 30);

    expect((await decline(ride.id, other.token)).statusCode).toBe(404);
  });

  it("is for drivers only", async () => {
    const passenger = await newUser("passenger");
    const ride = await rides.create({ passengerId: passenger.id, pickup, dropoff });

    expect((await decline(ride.id, passenger.token)).statusCode).toBe(403);
    const anon = await app.inject({ method: "POST", url: `/rides/${ride.id}/decline` });
    expect(anon.statusCode).toBe(401);
  });
});
