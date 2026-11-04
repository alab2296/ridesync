import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { migrate } from "../src/db/migrate.js";
import { PgDriverRepository } from "../src/drivers/repository.js";
import { createTestDb } from "./helpers/testDb.js";

describe("driver availability", () => {
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

  async function signUp(name: string, role: "passenger" | "driver" = "driver") {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name, email: `${name}@example.com`, password: "a-good-password", role },
    });
    return { token: res.json().token as string, id: res.json().user.id as string };
  }
  const post = (path: string, token?: string) =>
    app.inject({
      method: "POST",
      url: path,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  const statusInDb = async (id: string) =>
    (await db.pool.query("select status from drivers where user_id = $1", [id])).rows[0]?.status;

  it("takes a driver online and back offline", async () => {
    const { token, id } = await signUp("dora");
    const on = await post("/driver/online", token);
    expect(on.statusCode).toBe(200);
    expect(on.json()).toEqual({ status: "online" });
    expect(await statusInDb(id)).toBe("online");

    const off = await post("/driver/offline", token);
    expect(off.json()).toEqual({ status: "offline" });
    expect(await statusInDb(id)).toBe("offline");
  });

  it("is safe to repeat", async () => {
    const { token } = await signUp("drew");
    expect((await post("/driver/online", token)).statusCode).toBe(200);
    expect((await post("/driver/online", token)).json()).toEqual({ status: "online" });
    expect((await post("/driver/offline", token)).statusCode).toBe(200);
    expect((await post("/driver/offline", token)).json()).toEqual({ status: "offline" });
  });

  it("does not let a busy driver change availability", async () => {
    const { token, id } = await signUp("dave");
    await post("/driver/online", token);
    await db.pool.query("update drivers set status = 'busy' where user_id = $1", [id]);

    for (const path of ["/driver/online", "/driver/offline"]) {
      const res = await post(path, token);
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("DRIVER_BUSY");
    }
    expect(await statusInDb(id)).toBe("busy");
  });

  it("is for drivers only", async () => {
    const passenger = await signUp("pam", "passenger");
    expect((await post("/driver/online", passenger.token)).statusCode).toBe(403);
    expect((await post("/driver/offline")).statusCode).toBe(401);
  });
});
