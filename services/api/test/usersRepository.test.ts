import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PgUserRepository } from "../src/auth/pgUsers.js";
import { EmailTakenError, InMemoryUserRepository, type UserRepository } from "../src/auth/users.js";
import { migrate } from "../src/db/migrate.js";
import { createTestDb } from "./helpers/testDb.js";

// The same tests run against both stores, so they have to behave the same way.
function behavesLikeAUserStore(name: string, make: () => Promise<UserRepository>) {
  describe(name, () => {
    let users: UserRepository;
    beforeAll(async () => {
      users = await make();
    });

    const input = {
      role: "passenger" as const,
      name: "Sam",
      email: "Sam@Example.com",
      passwordHash: "h",
    };

    it("creates a user and finds it again", async () => {
      const created = await users.create(input);
      expect(created.email).toBe("sam@example.com");
      expect((await users.findById(created.id))?.name).toBe("Sam");
      expect((await users.findByEmail("SAM@example.com"))?.id).toBe(created.id);
    });

    it("refuses a second account with the same email", async () => {
      await expect(users.create({ ...input, email: "sam@EXAMPLE.com" })).rejects.toBeInstanceOf(
        EmailTakenError,
      );
    });

    it("returns undefined for people who do not exist", async () => {
      expect(await users.findByEmail("nobody@example.com")).toBeUndefined();
      expect(await users.findById("00000000-0000-0000-0000-000000000000")).toBeUndefined();
    });
  });
}

behavesLikeAUserStore("InMemoryUserRepository", async () => new InMemoryUserRepository());

describe("PgUserRepository", () => {
  let db: Awaited<ReturnType<typeof createTestDb>>;
  beforeAll(async () => {
    db = await createTestDb();
    await migrate(db.pool);
  });
  afterAll(async () => {
    await db.drop();
  });
  behavesLikeAUserStore(
    "same rules as the in-memory store",
    async () => new PgUserRepository(db.pool),
  );
});
