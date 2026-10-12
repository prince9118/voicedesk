import "dotenv/config";
import { z } from "zod";

// Same fail-fast approach as the API: validate every variable once, at startup.
const envSchema = z.object({
  LIVEKIT_URL: z.url({ protocol: /^wss?$/ }),
  LIVEKIT_API_KEY: z.string().min(1),
  LIVEKIT_API_SECRET: z.string().min(1),
  // Must match LIVEKIT_AGENT_NAME in the API, which names this agent in room tokens.
  LIVEKIT_AGENT_NAME: z.string().min(1).default("voicedesk-support"),
  // The SDK uploads call audio, transcripts, logs and traces to LiveKit Cloud by default.
  // Recording customers' voices has consent and retention implications, so it is opt-in here.
  // Set to "true" only while debugging calls in the LiveKit Cloud dashboard.
  AGENT_RECORD_SESSIONS: z.stringbool().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error(`Invalid environment configuration:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

export const config = parsed.data;
