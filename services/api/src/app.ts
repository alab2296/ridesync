import Fastify, { type FastifyInstance } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { authRoutes } from "./auth/routes.js";
import { InMemoryUserRepository, type UserRepository } from "./auth/users.js";
import type { Config } from "./config.js";
import { driverRoutes } from "./drivers/routes.js";
import type { DriverRepository } from "./drivers/repository.js";
import { errorHandler } from "./errors.js";
import type { LocationStore } from "./location/store.js";
import { rideRoutes } from "./rides/routes.js";
import type { RideRepository } from "./rides/repository.js";
import type { OfferRepository } from "./rides/offers.js";
import { wsGateway } from "./ws/gateway.js";
import { Hub } from "./ws/hub.js";

interface Deps {
  users: UserRepository;
  /** Rides need the database, so the ride routes only exist when this is given. */
  rides?: RideRepository;
  /** Driver availability also needs the database. */
  drivers?: DriverRepository;
  /** Ride offers (decline) also need the database. */
  offers?: OfferRepository;
  /** Open sockets by user; pass one in to push events from other code. */
  hub?: Hub;
  /** Latest driver positions (Redis). Needed for drivers to send locations. */
  locations?: LocationStore;
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
  if (deps.rides)
    app.register(rideRoutes, { prefix: "/rides", rides: deps.rides, offers: deps.offers });

  if (deps.drivers) app.register(driverRoutes, { prefix: "/driver", drivers: deps.drivers });

  app.register(wsGateway, { hub: deps.hub ?? new Hub(), locations: deps.locations });

  return app;
}
