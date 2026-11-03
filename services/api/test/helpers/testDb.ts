import { randomBytes } from "node:crypto";
import { createPool } from "../../src/db/migrate.js";

const url = process.env.DATABASE_URL ?? "postgres://ridesync:ridesync@localhost:5432/ridesync";

/**
 * Gives a test its own empty schema in the real database, so tests never see
 * each other's data. Needs the database running: docker compose up -d --wait db
 */
export async function createTestDb() {
  const schema = `test_${randomBytes(6).toString("hex")}`;
  const admin = createPool(url);
  await admin.query(`create schema ${schema}`);
  const pool = createPool(url, `-c search_path=${schema},public`);
  return {
    pool,
    async drop() {
      await pool.end();
      await admin.query(`drop schema ${schema} cascade`);
      await admin.end();
    },
  };
}
