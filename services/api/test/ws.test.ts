import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { InMemoryUserRepository } from "../src/auth/users.js";
import { Hub } from "../src/ws/hub.js";

describe("websocket gateway", () => {
  let app: FastifyInstance;
  let base: string;
  const hub = new Hub();

  beforeAll(async () => {
    app = buildApp(
      { LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) },
      { users: new InMemoryUserRepository(), hub },
    );
    await app.listen({ port: 0, host: "127.0.0.1" });
    base = `ws://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app.close();
  });

  async function signUp(name: string, role: "passenger" | "driver" = "passenger") {
    const res = await app.inject({
      method: "POST",
      url: "/auth/register",
      payload: { name, email: `${name}@example.com`, password: "a-good-password", role },
    });
    return { token: res.json().token as string, id: res.json().user.id as string };
  }

  /** Resolves with the first message, or the HTTP status if the upgrade is refused. */
  function open(url: string, headers: Record<string, string> = {}) {
    return new Promise<{ ws?: WebSocket; first?: unknown; status?: number }>((resolve) => {
      const ws = new WebSocket(url, { headers });
      ws.once("message", (raw) => resolve({ ws, first: JSON.parse(raw.toString()) }));
      ws.once("unexpected-response", (_req, res) => resolve({ status: res.statusCode }));
      ws.once("error", () => undefined);
    });
  }

  it("accepts a valid token from the query string and says ready", async () => {
    const { token, id } = await signUp("wendy");
    const { ws, first } = await open(`${base}/ws?token=${token}`);
    expect(first).toEqual({ type: "ready", data: { userId: id, role: "passenger" } });
    expect(hub.count(id)).toBe(1);
    ws!.close();
  });

  it("accepts a valid token from the Authorization header", async () => {
    const { token } = await signUp("walt", "driver");
    const { ws, first } = await open(`${base}/ws`, { authorization: `Bearer ${token}` });
    expect(first).toMatchObject({ type: "ready", data: { role: "driver" } });
    ws!.close();
  });

  it("refuses a missing or bad token with 401", async () => {
    expect((await open(`${base}/ws`)).status).toBe(401);
    expect((await open(`${base}/ws?token=nope`)).status).toBe(401);
  });

  it("pushes an event to the user's open socket and forgets it on close", async () => {
    const { token, id } = await signUp("wanda");
    const { ws } = await open(`${base}/ws?token=${token}`);
    const next = new Promise((resolve) =>
      ws!.once("message", (m) => resolve(JSON.parse(m.toString()))),
    );
    expect(hub.send(id, "ride_status", { status: "accepted" })).toBe(1);
    expect(await next).toEqual({ type: "ride_status", data: { status: "accepted" } });
    await new Promise((resolve) => {
      ws!.once("close", resolve);
      ws!.close();
    });
    await new Promise((r) => setTimeout(r, 50));
    expect(hub.count(id)).toBe(0);
    expect(hub.send(id, "ride_status", {})).toBe(0);
  });
});
