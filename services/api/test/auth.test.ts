import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { requireRole } from "../src/auth/guard.js";
import { hashPassword } from "../src/auth/password.js";
import { InMemoryUserRepository } from "../src/auth/users.js";

const alice = { name: "Alice", email: "alice@example.com", password: "a-good-password" };

describe("auth", () => {
  let app: FastifyInstance;
  let users: InMemoryUserRepository;

  beforeEach(() => {
    users = new InMemoryUserRepository();
    app = buildApp({ LOG_LEVEL: "silent", JWT_SECRET: "x".repeat(32) }, { users });
    app.get("/driver-only", { preHandler: requireRole("driver") }, async () => ({ ok: true }));
  });

  afterEach(async () => {
    await app.close();
  });

  const register = (body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/auth/register", payload: body });
  const login = (body: Record<string, unknown>) =>
    app.inject({ method: "POST", url: "/auth/login", payload: body });

  describe("register", () => {
    it("creates a passenger by default and returns a token", async () => {
      const res = await register(alice);
      expect(res.statusCode).toBe(201);
      expect(res.json().user).toMatchObject({ role: "passenger", email: "alice@example.com" });
      expect(res.json().token).toEqual(expect.any(String));
      expect(res.json().user.passwordHash).toBeUndefined();
    });

    it("rejects a duplicate email, whatever the letter case", async () => {
      await register(alice);
      const res = await register({ ...alice, email: "ALICE@example.com" });
      expect(res.statusCode).toBe(409);
      expect(res.json().error.code).toBe("EMAIL_TAKEN");
    });

    it("rejects a short password", async () => {
      const res = await register({ ...alice, password: "short" });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("VALIDATION_ERROR");
    });

    it("does not let anyone sign up as admin", async () => {
      const res = await register({ ...alice, role: "admin" });
      expect(res.statusCode).toBe(400);
    });
  });

  describe("login", () => {
    it("returns a token for the right password", async () => {
      await register(alice);
      const res = await login({ email: alice.email, password: alice.password });
      expect(res.statusCode).toBe(200);
      expect(res.json().token).toEqual(expect.any(String));
    });

    it("gives the same error for a wrong password and an unknown email", async () => {
      await register(alice);
      const wrong = await login({ email: alice.email, password: "not-the-password" });
      const unknown = await login({ email: "nobody@example.com", password: "whatever-it-is" });
      expect(wrong.statusCode).toBe(401);
      expect(unknown.statusCode).toBe(401);
      expect(wrong.json()).toEqual(unknown.json());
    });
  });

  describe("GET /auth/me", () => {
    it("needs a token", async () => {
      const res = await app.inject({ method: "GET", url: "/auth/me" });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHORIZED");
    });

    it("returns the logged-in user", async () => {
      const { token } = (await register(alice)).json();
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().user.email).toBe("alice@example.com");
    });

    it("rejects a garbage token", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/auth/me",
        headers: { authorization: "Bearer not.a.token" },
      });
      expect(res.statusCode).toBe(401);
    });
  });

  describe("requireRole", () => {
    it("blocks the wrong role and allows the right one", async () => {
      const passenger = (await register(alice)).json().token;
      await users.create({
        name: "Dan",
        email: "dan@example.com",
        role: "driver",
        passwordHash: await hashPassword("driver-password"),
      });
      const driver = (await login({ email: "dan@example.com", password: "driver-password" })).json()
        .token;

      const asPassenger = await app.inject({
        method: "GET",
        url: "/driver-only",
        headers: { authorization: `Bearer ${passenger}` },
      });
      const asDriver = await app.inject({
        method: "GET",
        url: "/driver-only",
        headers: { authorization: `Bearer ${driver}` },
      });
      expect(asPassenger.statusCode).toBe(403);
      expect(asDriver.statusCode).toBe(200);
    });
  });
});
