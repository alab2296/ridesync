import { buildApp } from "./app.js";
import { PgUserRepository } from "./auth/pgUsers.js";
import { InMemoryUserRepository } from "./auth/users.js";
import { loadConfig } from "./config.js";
import { createPool, migrate } from "./db/migrate.js";
import { PgDriverRepository } from "./drivers/repository.js";
import { Redis } from "ioredis";
import { RedisLocationStore } from "./location/store.js";
import { PgOfferRepository } from "./rides/offers.js";
import { PgRideRepository } from "./rides/repository.js";

const config = loadConfig();

// With a database configured, accounts are stored in Postgres. Without one the
// server still starts, but accounts are lost on restart.
const pool = config.DATABASE_URL ? createPool(config.DATABASE_URL) : undefined;
if (pool) await migrate(pool);
const users = pool ? new PgUserRepository(pool) : new InMemoryUserRepository();

const redis = config.REDIS_URL ? new Redis(config.REDIS_URL) : undefined;

const app = buildApp(config, {
  users,
  rides: pool ? new PgRideRepository(pool) : undefined,
  drivers: pool ? new PgDriverRepository(pool) : undefined,
  offers: pool ? new PgOfferRepository(pool) : undefined,
  locations: redis ? new RedisLocationStore(redis) : undefined,
});

try {
  await app.listen({ port: config.PORT, host: config.HOST });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    app.log.info({ signal }, "shutting down");
    app
      .close()
      .then(() => pool?.end())
      .then(() => redis?.quit())
      .then(() => process.exit(0));
  });
}
