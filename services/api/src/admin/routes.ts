import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guard.js";
import type { DriverRepository } from "../drivers/repository.js";
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
  opts: { drivers: DriverRepository; rides?: RideRepository },
): Promise<void> {
  app.addHook("preHandler", requireRole("admin"));

  app.get("/drivers", async (request) => {
    const { status } = parse(driversQuery, request.query);
    return { drivers: await opts.drivers.list(status) };
  });

  if (opts.rides) {
    const rides = opts.rides;
    app.get("/rides", async (request) => {
      const filter = parse(ridesQuery, request.query);
      return { rides: await rides.list(filter) };
    });
  }
}
