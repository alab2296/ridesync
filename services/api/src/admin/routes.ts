import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guard.js";
import type { DriverRepository } from "../drivers/repository.js";
import type { LocationStore } from "../location/store.js";
import type { RideRepository } from "../rides/repository.js";
import { parse } from "../validate.js";

const driversQuery = z.object({
  status: z.enum(["offline", "online", "busy"]).optional(),
});

const ridesQuery = z.object({
  status: z
    .enum(["SEARCHING", "ASSIGNED", "ARRIVING", "IN_PROGRESS", "COMPLETED", "CANCELLED"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function adminRoutes(
  app: FastifyInstance,
  opts: { drivers: DriverRepository; rides?: RideRepository; locations?: LocationStore },
): Promise<void> {
  app.addHook("preHandler", requireRole("admin"));

  app.get("/drivers", async (request) => {
    const { status } = parse(driversQuery, request.query);
    return { drivers: await opts.drivers.list(status) };
  });

  if (opts.locations) {
    const locations = opts.locations;
    // Drivers who are working right now, with their latest known position.
    // A driver with no fresh reading (expired in Redis) is left out.
    app.get("/drivers/locations", async () => {
      const [online, busy] = await Promise.all([
        opts.drivers.list("online"),
        opts.drivers.list("busy"),
      ]);
      const found = await Promise.all(
        [...online, ...busy].map(async (d) => {
          const location = await locations.get(d.id);
          return location ? { id: d.id, name: d.name, status: d.status, location } : null;
        }),
      );
      return { drivers: found.filter((d) => d !== null) };
    });
  }

  if (opts.rides) {
    const rides = opts.rides;
    app.get("/rides", async (request) => {
      const filter = parse(ridesQuery, request.query);
      return { rides: await rides.list(filter) };
    });
  }
}
