import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";

export function buildApp(config: Pick<Config, "LOG_LEVEL">): FastifyInstance {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });

  app.get("/health", async () => ({
    status: "ok",
    uptime: Math.round(process.uptime()),
  }));

  return app;
}
