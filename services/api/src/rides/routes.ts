import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/guard.js";
import { AppError } from "../errors.js";
import { parse } from "../validate.js";
import {
  ActiveRideExistsError,
  DriverNotAvailableError,
  RideNotFoundError,
  RideTakenError,
  type Ride,
  type RideRepository,
} from "./repository.js";

const place = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const createRideBody = z.object({ pickup: place, dropoff: place });
const rideParams = z.object({ id: z.string().uuid() });

function publicRide(ride: Ride) {
  return {
    id: ride.id,
    status: ride.status,
    pickup: ride.pickup,
    dropoff: ride.dropoff,
    driverId: ride.driverId,
    requestedAt: ride.requestedAt,
    assignedAt: ride.assignedAt,
    completedAt: ride.completedAt,
    cancelReason: ride.cancelReason,
  };
}

export async function rideRoutes(
  app: FastifyInstance,
  opts: { rides: RideRepository },
): Promise<void> {
  const { rides } = opts;

  app.post("/", { preHandler: requireRole("passenger") }, async (request, reply) => {
    const body = parse(createRideBody, request.body);
    try {
      const ride = await rides.create({
        passengerId: request.user.sub,
        pickup: body.pickup,
        dropoff: body.dropoff,
      });
      return reply.status(201).send({ ride: publicRide(ride) });
    } catch (err) {
      if (err instanceof ActiveRideExistsError) {
        throw new AppError(409, "ACTIVE_RIDE_EXISTS", "You already have a ride in progress");
      }
      throw err;
    }
  });

  app.get("/:id", { preHandler: requireAuth }, async (request) => {
    const { id } = parse(rideParams, request.params);
    const me = request.user;
    const ride = await rides.findById(id);
    const mayView =
      ride && (me.role === "admin" || ride.passengerId === me.sub || ride.driverId === me.sub);
    // Same answer for "does not exist" and "not yours", so ride ids cannot be guessed.
    if (!ride || !mayView) throw new AppError(404, "RIDE_NOT_FOUND", "Ride not found");
    return { ride: publicRide(ride) };
  });

  app.post("/:id/accept", { preHandler: requireRole("driver") }, async (request) => {
    const { id } = parse(rideParams, request.params);
    try {
      return { ride: publicRide(await rides.accept(id, request.user.sub)) };
    } catch (err) {
      if (err instanceof RideNotFoundError) {
        throw new AppError(404, "RIDE_NOT_FOUND", "Ride not found");
      }
      if (err instanceof RideTakenError) {
        throw new AppError(409, "RIDE_TAKEN", "Another driver already took this ride");
      }
      if (err instanceof DriverNotAvailableError) {
        throw new AppError(
          409,
          "DRIVER_NOT_AVAILABLE",
          "Go online and finish your current ride first",
        );
      }
      throw err;
    }
  });
}
