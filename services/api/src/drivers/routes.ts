import type { FastifyInstance } from "fastify";
import { requireRole } from "../auth/guard.js";
import { AppError } from "../errors.js";
import { DriverBusyError, type DriverRepository } from "./repository.js";

export async function driverRoutes(
  app: FastifyInstance,
  opts: { drivers: DriverRepository },
): Promise<void> {
  const { drivers } = opts;

  for (const [path, status] of [
    ["/online", "online"],
    ["/offline", "offline"],
  ] as const) {
    app.post(path, { preHandler: requireRole("driver") }, async (request) => {
      try {
        return { status: await drivers.setAvailability(request.user.sub, status) };
      } catch (err) {
        if (err instanceof DriverBusyError) {
          throw new AppError(409, "DRIVER_BUSY", "Finish your current ride first");
        }
        throw err;
      }
    });
  }
}
