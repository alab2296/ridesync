import type { FastifyRequest } from "fastify";
import "@fastify/jwt";
import { AppError } from "../errors.js";
import type { Role } from "./users.js";

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: { sub: string; role: Role };
    user: { sub: string; role: Role };
  }
}

/** Use as a route preHandler: the request must carry a valid token. */
export async function requireAuth(request: FastifyRequest): Promise<void> {
  try {
    await request.jwtVerify();
  } catch {
    throw new AppError(401, "UNAUTHORIZED", "Missing or invalid token");
  }
}

/** Use as a route preHandler: valid token AND one of the given roles. */
export function requireRole(...roles: Role[]) {
  return async (request: FastifyRequest): Promise<void> => {
    await requireAuth(request);
    if (!roles.includes(request.user.role)) {
      throw new AppError(403, "FORBIDDEN", "Your role cannot do this");
    }
  };
}
