import Fastify, { type FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { authRoutes } from "./auth/routes.js";
import { InMemoryUserRepository, type UserRepository } from "./auth/users.js";
import type { Config } from "./config.js";
import { errorHandler } from "./errors.js";
import { rideRoutes } from "./rides/routes.js";
import type { RideRepository } from "./rides/repository.js";

interface Deps {
  users: UserRepository;
  /** Rides need the database, so the ride routes only exist when this is given. */
  rides?: RideRepository;
}

export function buildApp(
  config: Pick<Config, "LOG_LEVEL" | "JWT_SECRET">,
  deps: Deps = { users: new InMemoryUserRepository() },
): FastifyInstance {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  app.setErrorHandler(errorHandler);
  app.register(fastifyJwt, { secret: config.JWT_SECRET });

  app.get("/health", async () => ({
    status: "ok",
    uptime: Math.round(process.uptime()),
  }));

  app.register(authRoutes, { prefix: "/auth", users: deps.users });
  if (deps.rides) app.register(rideRoutes, { prefix: "/rides", rides: deps.rides });

  return app;
}
