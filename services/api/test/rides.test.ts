import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { hashPassword } from "../src/auth/password.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgRideRepository } from "../src/rides/repository.js";
import { createTestDb } from "./helpers/testDb.js";

const pickup = { lat: 24.8607, lng: 67.0011 };
const dropoff = { lat: 24.9056, lng: 67.0822 };

describe("rides: request and read", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  let users: PgUserRepository;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    users = new PgUserRepository(db.pool);
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      { users, rides: new PgRideRepository(db.pool) },
    );
  });
  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  async function signUp(name: string, role: "passenger" | "driver" = "passenger") {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name, email: `${name}@example.com`, password: "a-good-password", role },
    });
    return { token: res.json().token as string, id: res.json().user.id as string };
  }
  const auth = (token: string) => ({ authorization: `Bearer ${token}` });
  const request = (token: string, payload: unknown = { pickup, dropoff }) =>
    app.inject({ method: "POST", url: "/rides", headers: auth(token), payload: payload as object });

  it("lets a passenger request a ride, which starts out SEARCHING", async () => {
    const { token, id } = await signUp("amy");
    const res = await request(token);
    expect(res.statusCode).toBe(201);
    expect(res.json().ride).toMatchObject({ status: "SEARCHING", driverId: null, pickup, dropoff });

    const read = await app.inject({
      method: "GET",
      url: `/rides/${res.json().ride.id}`,
      headers: auth(token),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().ride.id).toBe(res.json().ride.id);
    expect(id).toBeTruthy();
  });

  it("allows only one active ride per passenger", async () => {
    const { token } = await signUp("ben");
    expect((await request(token)).statusCode).toBe(201);
    const second = await request(token);
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("ACTIVE_RIDE_EXISTS");
  });

  it("only lets passengers request rides", async () => {
    const { token } = await signUp("dan", "driver");
    expect((await request(token)).statusCode).toBe(403);
    const none = await app.inject({ method: "POST", url: "/rides", payload: { pickup, dropoff } });
    expect(none.statusCode).toBe(401);
  });

  it("rejects places that are not real coordinates", async () => {
    const { token } = await signUp("cara");
    const res = await request(token, { pickup: { lat: 91, lng: 0 }, dropoff });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");
    expect((await request(token, { pickup })).statusCode).toBe(400);
  });

  it("hides a ride from people who are not part of it, but not from an admin", async () => {
    const owner = await signUp("eve");
    const stranger = await signUp("finn");
    const rideId = (await request(owner.token)).json().ride.id;

    const asStranger = await app.inject({
      method: "GET",
      url: `/rides/${rideId}`,
      headers: auth(stranger.token),
    });
    expect(asStranger.statusCode).toBe(404);

    await users.create({
      role: "admin",
      name: "Root",
      email: "root@example.com",
      passwordHash: await hashPassword("admin-password"),
    });
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { email: "root@example.com", password: "admin-password" },
    });
    const asAdmin = await app.inject({
      method: "GET",
      url: `/rides/${rideId}`,
      headers: auth(login.json().token),
    });
    expect(asAdmin.statusCode).toBe(200);
  });

  it("answers 400 for an id that is not a uuid and 404 for one that does not exist", async () => {
    const { token } = await signUp("gus");
    const bad = await app.inject({ method: "GET", url: "/rides/not-a-uuid", headers: auth(token) });
    const missing = await app.inject({
      method: "GET",
      url: "/rides/00000000-0000-0000-0000-000000000000",
      headers: auth(token),
    });
    expect(bad.statusCode).toBe(400);
    expect(missing.statusCode).toBe(404);
  });
});
