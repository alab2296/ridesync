import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import {
  OfferNotFoundError,
  OfferNotPossibleError,
  PgOfferRepository,
} from "../src/rides/offers.js";
import { PgRideRepository } from "../src/rides/repository.js";
import { createTestDb } from "./helpers/testDb.js";

const pickup = { lat: 24.8607, lng: 67.0011 };
const dropoff = { lat: 24.9056, lng: 67.0822 };

describe("ride offers", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
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
  });
  afterAll(async () => {
    await db.drop();
  });

  const newUser = async (role: "passenger" | "driver") =>
    (
      await users.create({
        role,
        name: role,
        email: `${role}${++counter}@example.com`,
        passwordHash: "h",
      })
    ).id;
  const newRide = async () =>
    rides.create({ passengerId: await newUser("passenger"), pickup, dropoff });
  const expireNow = (offerId: string) =>
    db.pool.query("update ride_offers set expires_at = now() - interval '1 second' where id = $1", [
      offerId,
    ]);

  it("creates a pending offer that expires in the future", async () => {
    const ride = await newRide();
    const driver = await newUser("driver");
    const offer = await offers.create(ride.id, driver, 15);
    expect(offer.result).toBe("pending");
    expect(offer.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("refuses a second offer while one is pending", async () => {
    const ride = await newRide();
    await offers.create(ride.id, await newUser("driver"), 15);
    await expect(offers.create(ride.id, await newUser("driver"), 15)).rejects.toBeInstanceOf(
      OfferNotPossibleError,
    );
  });

  it("refuses to offer a ride that is no longer searching", async () => {
    const ride = await newRide();
    await db.pool.query("update rides set status = 'CANCELLED' where id = $1", [ride.id]);
    await expect(offers.create(ride.id, await newUser("driver"), 15)).rejects.toBeInstanceOf(
      OfferNotPossibleError,
    );
  });

  it("lets the driver decline, then the next driver can be offered", async () => {
    const ride = await newRide();
    const first = await newUser("driver");
    await offers.create(ride.id, first, 15);
    expect((await offers.decline(ride.id, first)).result).toBe("declined");
    await expect(offers.create(ride.id, await newUser("driver"), 15)).resolves.toBeDefined();
  });

  it("does not offer the same ride to the same driver twice", async () => {
    const ride = await newRide();
    const driver = await newUser("driver");
    await offers.create(ride.id, driver, 15);
    await offers.decline(ride.id, driver);
    await expect(offers.create(ride.id, driver, 15)).rejects.toBeInstanceOf(OfferNotPossibleError);
  });

  it("rejects a decline from the wrong driver, a repeat, or a late one", async () => {
    const ride = await newRide();
    const driver = await newUser("driver");
    const offer = await offers.create(ride.id, driver, 15);
    await expect(offers.decline(ride.id, await newUser("driver"))).rejects.toBeInstanceOf(
      OfferNotFoundError,
    );
    await expireNow(offer.id);
    await expect(offers.decline(ride.id, driver)).rejects.toBeInstanceOf(OfferNotFoundError);

    const ride2 = await newRide();
    const driver2 = await newUser("driver");
    await offers.create(ride2.id, driver2, 15);
    await offers.decline(ride2.id, driver2);
    await expect(offers.decline(ride2.id, driver2)).rejects.toBeInstanceOf(OfferNotFoundError);
  });

  it("expires only the offers whose time ran out", async () => {
    const lateRide = await newRide();
    const late = await offers.create(lateRide.id, await newUser("driver"), 15);
    const freshRide = await newRide();
    const fresh = await offers.create(freshRide.id, await newUser("driver"), 15);
    await expireNow(late.id);

    const expired = await offers.expireDue();
    expect(expired.map((o) => o.id)).toContain(late.id);
    expect(expired.map((o) => o.id)).not.toContain(fresh.id);
    expect((await offers.expireDue()).map((o) => o.id)).not.toContain(late.id);

    // an expired offer frees the ride for the next driver
    await expect(offers.create(lateRide.id, await newUser("driver"), 15)).resolves.toBeDefined();
  });
});
