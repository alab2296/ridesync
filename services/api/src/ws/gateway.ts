import fastifyWebsocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import type { Hub } from "./hub.js";

interface Options {
  hub: Hub;
}

/**
 * GET /ws?token=<jwt>. Browsers cannot set headers on a WebSocket, so the token
 * may come in the query string; an Authorization header works too. The token is
 * checked before the connection is upgraded, so a bad token gets a plain 401.
 */
export async function wsGateway(app: FastifyInstance, opts: Options): Promise<void> {
  await app.register(fastifyWebsocket);

  app.get(
    "/ws",
    {
      preValidation: async (request) => {
        const { token } = request.query as { token?: string };
        if (token && !request.headers.authorization) {
          request.headers.authorization = `Bearer ${token}`;
        }
        try {
          await request.jwtVerify();
        } catch {
          throw new AppError(401, "UNAUTHORIZED", "Missing or invalid token");
        }
      },
      websocket: true,
    },
    (socket, request) => {
      const { sub, role } = request.user;
      opts.hub.add(sub, socket);
      socket.send(JSON.stringify({ type: "ready", data: { userId: sub, role } }));
    },
  );
}
