import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireRole } from "../auth/guard.js";
import type { DriverRepository } from "../drivers/repository.js";
import { parse } from "../validate.js";

const driversQuery = z.object({
  status: z.enum(["offline", "online", "busy"]).optional(),
});

export async function adminRoutes(
  app: FastifyInstance,
  opts: { drivers: DriverRepository },
): Promise<void> {
  app.addHook("preHandler", requireRole("admin"));

  app.get("/drivers", async (request) => {
    const { status } = parse(driversQuery, request.query);
    return { drivers: await opts.drivers.list(status) };
  });
}
