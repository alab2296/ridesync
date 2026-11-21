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

describe("GET /admin/rides", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      {
        users: new PgUserRepository(db.pool),
        drivers: new PgDriverRepository(db.pool),
        rides: new PgRideRepository(db.pool),
      },
    );
  });
  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  async function signUp(name: string, role: "passenger" | "driver") {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name, email: `${name}@example.com`, password: "a-good-password", role },
    });
    return { token: res.json().token as string, id: res.json().user.id as string };
  }
  const adminToken = () =>
    app.jwt.sign({ sub: "00000000-0000-0000-0000-000000000001", role: "admin" });
  const get = (url: string, token?: string) =>
    app.inject({
      method: "GET",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it("lists rides newest first, filters by status and pages", async () => {
    const first = await signUp("pam", "passenger");
    const second = await signUp("pete", "passenger");
    const third = await signUp("pia", "passenger");
    const request = (token: string) =>
      app.inject({
        method: "POST",
        url: "/rides",
        headers: { authorization: `Bearer ${token}` },
        payload: { pickup, dropoff },
      });
    const r1 = (await request(first.token)).json().ride;
    const r2 = (await request(second.token)).json().ride;
    const r3 = (await request(third.token)).json().ride;
    await app.inject({
      method: "POST",
      url: `/rides/${r1.id}/cancel`,
      headers: { authorization: `Bearer ${first.token}` },
      payload: {},
    });

    const all = await get("/admin/rides", adminToken());
    expect(all.statusCode).toBe(200);
    const ids = (all.json().rides as { id: string }[]).map((r) => r.id);
    expect(ids).toEqual([r3.id, r2.id, r1.id]);

    const cancelled = await get("/admin/rides?status=CANCELLED", adminToken());
    expect(cancelled.json().rides.map((r: { id: string }) => r.id)).toEqual([r1.id]);

    const page = await get("/admin/rides?limit=1&offset=1", adminToken());
    expect(page.json().rides.map((r: { id: string }) => r.id)).toEqual([r2.id]);
  });

  it("rejects a bad status or limit", async () => {
    expect((await get("/admin/rides?status=lost", adminToken())).statusCode).toBe(400);
    expect((await get("/admin/rides?limit=0", adminToken())).statusCode).toBe(400);
    expect((await get("/admin/rides?limit=101", adminToken())).statusCode).toBe(400);
  });

  it("is for admins only", async () => {
    expect((await get("/admin/rides")).statusCode).toBe(401);
    const { token } = await signUp("dora", "driver");
    expect((await get("/admin/rides", token)).statusCode).toBe(403);
  });
});
