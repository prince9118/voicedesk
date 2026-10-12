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
  // LiveKit Cloud project (Settings -> API keys). The URL is given to browsers; the key and
  // secret sign access tokens and must never leave the server.
  LIVEKIT_URL: z.url({ protocol: /^wss?$/ }),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  // Must match the agentName the voice agent registers with (apps/agent). Tokens name it so that
  // LiveKit dispatches our agent into support rooms, and only into those.
  LIVEKIT_AGENT_NAME: z.string().min(1).default("voicedesk-support"),
  // Shared secret the voice agent presents ("Authorization: Agent <key>") to act for the user
  // bound to its room. Long and random: generate with
  //   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
  AGENT_API_KEY: z.string().min(32),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Fail fast with a readable message. prettifyError reports which variable is wrong,
  // not its value, so a malformed secret is not printed to the logs.
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const config = parsed.data;
