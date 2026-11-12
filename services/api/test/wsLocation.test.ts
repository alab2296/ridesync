import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { Redis } from "ioredis";
import { WebSocket } from "ws";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryUserRepository } from "../src/auth/users.js";
import { RedisLocationStore } from "../src/location/store.js";

const url = process.env.REDIS_URL ?? "redis://localhost:6379";

describe("driver location over the websocket", () => {
  let app: FastifyInstance;
  let redis: Redis;
  let store: RedisLocationStore;
  let base: string;

  beforeAll(async () => {
    redis = new Redis(url, { db: 15 });
    store = new RedisLocationStore(redis, 30);
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      { users: new InMemoryUserRepository(), locations: store },
    );
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  beforeEach(async () => {
    await redis.flushdb();
  });
  afterAll(async () => {
    await app.close();
    await redis.flushdb();
    redis.disconnect();
  });

  async function signUp(name: string, role: "passenger" | "driver") {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name, email: `${name}@example.com`, password: "a-good-password", role },
    });
    return { token: res.json().token as string, id: res.json().user.id as string };
  }

  /** Opens a socket and waits for the ready message. */
  async function connect(token: string) {
    const ws = new WebSocket(`${base}/ws?token=${token}`);
    await new Promise((resolve) => ws.once("message", resolve));
    return ws;
  }

  const next = (ws: WebSocket) =>
    new Promise<{ type: string; data: Record<string, unknown> }>((resolve) =>
      ws.once("message", (m) => resolve(JSON.parse(m.toString()))),
    );

  const reading = { lat: 48.5734, lng: 13.4579, heading: 90, ts: 1000 };

  it("stores a driver's location message", async () => {
    const { token, id } = await signUp("lena", "driver");
    const ws = await connect(token);
    const ack = next(ws);
    ws.send(JSON.stringify({ type: "location", data: reading }));
    expect(await ack).toEqual({ type: "location_ack", data: { ts: 1000, applied: true } });
    expect(await store.get(id)).toEqual(reading);
    ws.close();
  });

  it("reports an older reading as not applied", async () => {
    const { token, id } = await signUp("lars", "driver");
    const ws = await connect(token);
    let ack = next(ws);
    ws.send(JSON.stringify({ type: "location", data: { ...reading, ts: 2000 } }));
    await ack;
    ack = next(ws);
    ws.send(JSON.stringify({ type: "location", data: { ...reading, heading: 5, ts: 1500 } }));
    expect((await ack).data).toEqual({ ts: 1500, applied: false });
    expect((await store.get(id))?.ts).toBe(2000);
    ws.close();
  });

  it("rejects invalid coordinates and bad JSON, and stores nothing", async () => {
    const { token, id } = await signUp("lotte", "driver");
    const ws = await connect(token);
    for (const bad of [
      JSON.stringify({ type: "location", data: { ...reading, lat: 91 } }),
      JSON.stringify({ type: "location", data: { ...reading, lng: "x" } }),
      JSON.stringify({ type: "location", data: { lat: 1 } }),
      "not json",
    ]) {
      const reply = next(ws);
      ws.send(bad);
      expect((await reply).type).toBe("error");
    }
    expect(await store.get(id)).toBeNull();
    ws.close();
  });

  it("does not let a passenger publish a location", async () => {
    const { token, id } = await signUp("paula", "passenger");
    const ws = await connect(token);
    const reply = next(ws);
    ws.send(JSON.stringify({ type: "location", data: reading }));
    const msg = await reply;
    expect(msg.type).toBe("error");
    expect(msg.data.code).toBe("FORBIDDEN");
    expect(await store.get(id)).toBeNull();
    ws.close();
  });
});
