import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";

describe("GET /health", () => {
  it("returns ok", async () => {
    const app = buildApp({ LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) });
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok" });
    await app.close();
  });
});
