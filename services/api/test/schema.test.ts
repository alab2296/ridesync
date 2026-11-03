import type pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "../src/db/migrate.js";
import { createTestDb } from "./helpers/testDb.js";

const point = "st_setsrid(st_makepoint(67.0, 24.8), 4326)::geography";

describe("database schema", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let pool: pg.Pool;

  beforeAll(async () => {
    db = await createTestDb();
    pool = db.pool;
    await migrate(pool);
  });
  afterAll(async () => {
    await db.drop();
  });

  const addUser = async (role: string, email: string) =>
    (
      await pool.query<{ id: string }>(
        "insert into users (role, name, email, password_hash) values ($1, 'n', $2, 'h') returning id",
        [role, email],
      )
    ).rows[0]!.id;

  const addRide = (passenger: string, driver: string | null, status: string) =>
    pool.query(
      `insert into rides (passenger_id, driver_id, status, pickup, dropoff)
       values ($1, $2, $3, ${point}, ${point})`,
      [passenger, driver, status],
    );

  it("does not run migrations twice", async () => {
    expect(await migrate(pool)).toEqual([]);
  });

  it("treats emails as unique whatever the letter case", async () => {
    await addUser("passenger", "same@example.com");
    await expect(addUser("passenger", "SAME@example.com")).rejects.toThrow(/users_email_key/);
  });

  it("will not let a driver have two active rides", async () => {
    const passenger = await addUser("passenger", "p1@example.com");
    const driver = await addUser("driver", "d1@example.com");
    await addRide(passenger, driver, "ASSIGNED");
    await expect(addRide(passenger, driver, "ARRIVING")).rejects.toThrow(
      /one_active_ride_per_driver/,
    );
    await addRide(passenger, driver, "COMPLETED"); // finished rides do not count
  });

  it("needs a driver once a ride is assigned", async () => {
    const passenger = await addUser("passenger", "p2@example.com");
    await expect(addRide(passenger, null, "ASSIGNED")).rejects.toThrow(/driver_when_assigned/);
    await addRide(passenger, null, "SEARCHING");
  });
});
