import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AppError } from "../errors.js";
import { requireAuth } from "./guard.js";
import { hashPassword, verifyPassword } from "./password.js";
import { EmailTakenError, type User, type UserRepository } from "./users.js";

// Only passengers and drivers can sign themselves up. Admins are never self-registered.
const registerBody = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(8).max(200),
  role: z.enum(["passenger", "driver"]).default("passenger"),
});

const loginBody = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

// Checked when the email is unknown, so "no such user" takes as long as "wrong password".
const dummyHash = hashPassword("not-a-real-password");

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") || "body";
    throw new AppError(400, "VALIDATION_ERROR", `${where}: ${first?.message ?? "invalid"}`);
  }
  return result.data;
}

function publicUser(user: User) {
  return { id: user.id, role: user.role, name: user.name, email: user.email };
}

export async function authRoutes(
  app: FastifyInstance,
  opts: { users: UserRepository },
): Promise<void> {
  const { users } = opts;
  const issueToken = (user: User) =>
    app.jwt.sign({ sub: user.id, role: user.role }, { expiresIn: "1h" });

  app.post("/register", async (request, reply) => {
    const body = parse(registerBody, request.body);
    try {
      const user = await users.create({
        name: body.name,
        email: body.email,
        role: body.role,
        passwordHash: await hashPassword(body.password),
      });
      return reply.status(201).send({ user: publicUser(user), token: issueToken(user) });
    } catch (err) {
      if (err instanceof EmailTakenError) {
        throw new AppError(409, "EMAIL_TAKEN", "That email is already registered");
      }
      throw err;
    }
  });

  app.post("/login", async (request) => {
    const body = parse(loginBody, request.body);
    const user = await users.findByEmail(body.email);
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) throw new AppError(401, "INVALID_CREDENTIALS", "Wrong email or password");
    return { user: publicUser(user), token: issueToken(user) };
  });

  app.get("/me", { preHandler: requireAuth }, async (request) => {
    const user = await users.findById(request.user.sub);
    if (!user) throw new AppError(401, "UNAUTHORIZED", "Account no longer exists");
    return { user: publicUser(user) };
  });
}
