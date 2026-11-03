import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

/** An error we expect and want to show the client. */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Every error leaves the API in one shape: { error: { code, message } }. */
export function errorHandler(
  error: FastifyError | AppError,
  request: FastifyRequest,
  reply: FastifyReply,
): void {
  if (error instanceof AppError) {
    void reply
      .status(error.statusCode)
      .send({ error: { code: error.code, message: error.message } });
    return;
  }
  const status = "statusCode" in error && error.statusCode ? error.statusCode : 500;
  if (status < 500) {
    void reply.status(status).send({ error: { code: "BAD_REQUEST", message: error.message } });
    return;
  }
  request.log.error(error);
  void reply.status(500).send({ error: { code: "INTERNAL", message: "Something went wrong" } });
}
