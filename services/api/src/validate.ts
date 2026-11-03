import type { z } from "zod";
import { AppError } from "./errors.js";

/** Checks input against a zod schema and throws a 400 in the API's error shape. */
export function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.join(".") || "body";
    throw new AppError(400, "VALIDATION_ERROR", `${where}: ${first?.message ?? "invalid"}`);
  }
  return result.data;
}
