import fastifyWebsocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import { z } from "zod";
import type { LocationStore } from "../location/store.js";
import type { Hub } from "./hub.js";

interface Options {
  hub: Hub;
  /** Where driver location messages are saved. Without it they are refused. */
  locations?: LocationStore;
}

const locationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360),
  ts: z.number().int().positive(),
});

const messageSchema = z.object({ type: z.string(), data: z.unknown() });

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

      const reply = (type: string, data: unknown) => socket.send(JSON.stringify({ type, data }));
      const fail = (code: string, message: string) => reply("error", { code, message });

      socket.on("message", async (raw) => {
        try {
          const message = messageSchema.safeParse(JSON.parse(raw.toString()));
          if (!message.success) return fail("BAD_MESSAGE", "Expected {type, data}");
          if (message.data.type !== "location") {
            return fail("UNKNOWN_TYPE", `Unknown message type: ${message.data.type}`);
          }
          if (role !== "driver" || !opts.locations) {
            return fail("FORBIDDEN", "Only drivers can send locations");
          }
          const loc = locationSchema.safeParse(message.data.data);
          if (!loc.success) {
            const issue = loc.error.issues[0];
            return fail("VALIDATION_ERROR", `${issue?.path.join(".")}: ${issue?.message}`);
          }
          const applied = await opts.locations.update(sub, loc.data);
          reply("location_ack", { ts: loc.data.ts, applied });
        } catch (err) {
          if (err instanceof SyntaxError) return fail("BAD_MESSAGE", "Message is not valid JSON");
          app.log.error(err, "websocket message failed");
          fail("INTERNAL", "Something went wrong");
        }
      });
    },
  );
}
