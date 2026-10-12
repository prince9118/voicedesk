import { z } from "zod";
import { AppError } from "./errors.js";

type RequestPart = "body" | "params" | "query";

// Validates one part of a request. The generic T ties the return type to the schema passed in,
// so callers get fully typed data without casts. Throws AppError(400) on failure.
export function parseInput<T extends z.ZodType>(
  schema: T,
  data: unknown,
  part: RequestPart,
): z.output<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(400, "VALIDATION_ERROR", `Invalid request ${part}`, {
      part,
      ...z.flattenError(result.error),
    });
  }
  return result.data;
}
