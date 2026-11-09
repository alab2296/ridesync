import type { FastifyInstance, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";

/**
 * GET /ws?token=<jwt>
 * Browsers cannot set headers on a WebSocket, so the token travels in the query string.
 * A bad or missing token is refused with 401 before the upgrade happens.
 */
export async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/ws",
    {
      websocket: true,
      preValidation: async (request: FastifyRequest) => {
        const { token } = request.query as { token?: string };
        try {
          if (!token) throw new Error("no token");
          request.user = app.jwt.verify(token);
        } catch {
          throw new AppError(401, "UNAUTHORIZED", "Missing or invalid token");
        }
      },
    },
    (socket, request) => {
      const { sub, role } = request.user;
      app.hub.add(sub, socket);
      socket.send(JSON.stringify({ type: "welcome", userId: sub, role }));
    },
  );
}
