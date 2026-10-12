import { z } from "zod";
import { AppError } from "./errors.js";

type RequestPart = "body" | "params" | "query";

// Free text that will be stored in Postgres. Postgres text columns reject the NUL character
// (\u0000), so without this check such input would pass validation and fail as a 500 in the database.
export function textField(min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !value.includes("\u0000"), { message: "Must not contain NUL characters" });
}

// Normalize before validating: Zod runs format checks before transforms, so
// z.email().trim() would reject "  Asha@Example.COM ". 320 = maximum email length = column size.
export const emailField = z.string().trim().toLowerCase().pipe(z.email().max(320));

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
