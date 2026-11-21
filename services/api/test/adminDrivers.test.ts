import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import { createTestDb } from "./helpers/testDb.js";

describe("GET /admin/drivers", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  let app: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      { users: new PgUserRepository(db.pool), drivers: new PgDriverRepository(db.pool) },
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
  const list = (url: string, token?: string) =>
    app.inject({
      method: "GET",
      url,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });

  it("lists drivers with their status, and can filter by status", async () => {
    const a = await signUp("anna", "driver");
    const b = await signUp("ben", "driver");
    await signUp("pat", "passenger");
    await app.inject({
      method: "POST",
      url: "/driver/online",
      headers: { authorization: `Bearer ${a.token}` },
    });
    await app.inject({
      method: "POST",
      url: "/driver/offline",
      headers: { authorization: `Bearer ${b.token}` },
    });

    const all = await list("/admin/drivers", adminToken());
    expect(all.statusCode).toBe(200);
    const drivers = all.json().drivers as { id: string; name: string; status: string }[];
    expect(drivers.map((d) => [d.name, d.status])).toEqual([
      ["anna", "online"],
      ["ben", "offline"],
    ]);

    const online = await list("/admin/drivers?status=online", adminToken());
    expect(online.json().drivers.map((d: { id: string }) => d.id)).toEqual([a.id]);
  });

  it("rejects an unknown status filter", async () => {
    const res = await list("/admin/drivers?status=flying", adminToken());
    expect(res.statusCode).toBe(400);
  });

  it("is for admins only", async () => {
    expect((await list("/admin/drivers")).statusCode).toBe(401);
    const { token } = await signUp("dan", "driver");
    expect((await list("/admin/drivers", token)).statusCode).toBe(403);
  });
});
