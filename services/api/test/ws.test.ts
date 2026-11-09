import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "../src/app.js";

describe("websocket gateway", () => {
  let app: FastifyInstance;
  let base: string;

  beforeAll(async () => {
    app = buildApp({ LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    base = `ws://127.0.0.1:${port}`;
  });
  afterAll(async () => {
    await app.close();
  });

  const tokenFor = (sub: string, role: "passenger" | "driver" = "passenger") =>
    app.jwt.sign({ sub, role });

  /** Resolves with the first message, or rejects with the HTTP status of a refused upgrade. */
  const firstOutcome = (url: string) =>
    new Promise<{ opened: true; message: unknown } | { opened: false; status: number }>(
      (resolve, reject) => {
        const socket = new WebSocket(url);
        socket.on("message", (data) => {
          resolve({ opened: true, message: JSON.parse(data.toString()) });
          socket.close();
        });
        socket.on("unexpected-response", (_req, res) => {
          resolve({ opened: false, status: res.statusCode ?? 0 });
        });
        socket.on("error", () => undefined);
        setTimeout(() => reject(new Error("timed out")), 3000);
      },
    );

  it("refuses a connection with no token", async () => {
    expect(await firstOutcome(`${base}/ws`)).toEqual({ opened: false, status: 401 });
  });

  it("refuses a connection with a bad token", async () => {
    expect(await firstOutcome(`${base}/ws?token=nope`)).toEqual({ opened: false, status: 401 });
  });

  it("accepts a valid token and greets with the caller's identity", async () => {
    const out = await firstOutcome(`${base}/ws?token=${tokenFor("user-1", "driver")}`);
    expect(out).toEqual({
      opened: true,
      message: { type: "welcome", userId: "user-1", role: "driver" },
    });
  });

  it("tracks connections per user and forgets them on close", async () => {
    const socket = new WebSocket(`${base}/ws?token=${tokenFor("user-2")}`);
    await new Promise((r) => socket.once("message", r));
    expect(app.hub.connectionCount("user-2")).toBe(1);
    socket.close();
    await new Promise((r) => socket.once("close", r));
    await new Promise((r) => setTimeout(r, 50));
    expect(app.hub.connectionCount("user-2")).toBe(0);
  });

  it("delivers an event sent to a user", async () => {
    const socket = new WebSocket(`${base}/ws?token=${tokenFor("user-3")}`);
    await new Promise((r) => socket.once("message", r));
    const next = new Promise<unknown>((r) =>
      socket.once("message", (d) => r(JSON.parse(d.toString()))),
    );
    app.hub.sendTo("user-3", { type: "ride_status", rideId: "r1", status: "accepted" });
    expect(await next).toEqual({ type: "ride_status", rideId: "r1", status: "accepted" });
    socket.close();
  });

  it("drops a connection that stops answering pings", async () => {
    app.hub.startHeartbeat(40);
    // A raw client that never auto-replies to pings.
    const socket = new WebSocket(`${base}/ws?token=${tokenFor("user-4")}`, { autoPong: false });
    await new Promise((r) => socket.once("message", r));
    expect(app.hub.connectionCount("user-4")).toBe(1);
    await new Promise((r) => socket.once("close", r));
    await new Promise((r) => setTimeout(r, 50));
    expect(app.hub.connectionCount("user-4")).toBe(0);
    app.hub.startHeartbeat(30_000);
  });

  it("keeps a connection that answers pings", async () => {
    app.hub.startHeartbeat(40);
    const socket = new WebSocket(`${base}/ws?token=${tokenFor("user-5")}`);
    await new Promise((r) => socket.once("message", r));
    await new Promise((r) => setTimeout(r, 300));
    expect(app.hub.connectionCount("user-5")).toBe(1);
    socket.close();
    app.hub.startHeartbeat(30_000);
  });
});
