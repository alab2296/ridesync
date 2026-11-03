import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/auth/password.js";

describe("password hashing", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
    expect(await verifyPassword("wrong password", stored)).toBe(false);
  });

  it("never stores the plain password and salts every hash", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toContain("same-password");
    expect(a).not.toBe(b);
  });

  it("rejects a malformed stored value instead of throwing", async () => {
    expect(await verifyPassword("anything", "not-a-valid-hash")).toBe(false);
  });
});
