import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import type { DriverLocation, LocationStore } from "../src/location/store.js";
import { createTestDb } from "./helpers/testDb.js";

class FakeLocations implements LocationStore {
  readonly data = new Map<string, DriverLocation>();
  async update(id: string, loc: DriverLocation) {
    this.data.set(id, loc);
    return true;
  }
  async get(id: string) {
    return this.data.get(id) ?? null;
  }
  async nearby() {
    return [];
  }
  async remove(id: string) {
    this.data.delete(id);
  }
}

describe("GET /admin/drivers/locations", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;
  const locations = new FakeLocations();

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      { users: new PgUserRepository(db.pool), drivers: new PgDriverRepository(db.pool), locations },
    );
  });
  afterAll(async () => {
    await app.close();
    await db.drop();
  });

  async function driver(name: string, online: boolean) {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: {
        name,
        email: `${name}@example.com`,
        password: "a-good-password",
        role: "driver",
      },
    });
    const token = res.json().token as string;
    await app.inject({
      method: "POST",
      url: online ? "/driver/online" : "/driver/offline",
      headers: { authorization: `Bearer ${token}` },
    });
    return { token, id: res.json().user.id as string };
  }
  const adminToken = () =>
    app.jwt.sign({ sub: "00000000-0000-0000-0000-000000000001", role: "admin" });
  const get = (token?: string) =>
    app.inject({
      method: "GET",
      url: "/admin/drivers/locations",
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it("returns online drivers that have a fresh position, and skips the rest", async () => {
    const withPos = await driver("lena", true);
    await driver("max", true); // online, but no reading
    const off = await driver("nora", false);
    const reading = { lat: 59.33, lng: 18.06, heading: 90, ts: 1000 };
    locations.data.set(withPos.id, reading);
    locations.data.set(off.id, reading); // offline drivers never show

    const res = await get(adminToken());
    expect(res.statusCode).toBe(200);
    expect(res.json().drivers).toEqual([
      { id: withPos.id, name: "lena", status: "online", location: reading },
    ]);
  });

  it("is for admins only", async () => {
    expect((await get()).statusCode).toBe(401);
    const { token } = await driver("omar", true);
    expect((await get(token)).statusCode).toBe(403);
  });
});
