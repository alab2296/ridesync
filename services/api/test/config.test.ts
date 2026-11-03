import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const secret = "x".repeat(32);

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig({ JWT_SECRET: secret });
    expect(c.PORT).toBe(3000);
    expect(c.NODE_ENV).toBe("development");
  });
  it("rejects an invalid port", () => {
    expect(() => loadConfig({ JWT_SECRET: secret, PORT: "abc" })).toThrow(/Invalid configuration/);
  });
  it("requires a long enough JWT secret", () => {
    expect(() => loadConfig({})).toThrow(/JWT_SECRET/);
    expect(() => loadConfig({ JWT_SECRET: "too-short" })).toThrow(/JWT_SECRET/);
  });
});
