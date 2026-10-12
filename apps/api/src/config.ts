import "dotenv/config";
import { z } from "zod";

// Every environment variable the API depends on, validated once at startup.
// Anything that reads configuration imports `config` instead of touching process.env.
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  // Env vars are always strings; coerce turns "4000" into 4000 before validating.
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message. prettifyError reports which variable is wrong,
  // not its value, so a malformed secret is not printed to the logs.
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const config = parsed.data;
