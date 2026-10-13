import { defineConfig } from "vitest/config";
import { TEST_DATABASE_URL } from "./test/test-env.js";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // Set before any app module loads, so src/config.ts validates these instead of .env
    // (dotenv never overrides variables that are already set).
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
      DATABASE_URL: TEST_DATABASE_URL,
      // Signing a LiveKit token is local crypto, no network call, so tests never need real
      // credentials. Tests verify tokens with this same key and secret.
      LIVEKIT_URL: "wss://voicedesk-test.livekit.cloud",
      LIVEKIT_API_KEY: "APItestkey",
      LIVEKIT_API_SECRET: "test-secret-that-is-only-used-in-tests-0123456789",
      AGENT_API_KEY: "test-agent-key-only-used-in-tests-0123456789abcdef",
      // Explicit so tests do not depend on defaults. Per-IP auth limits are high because every test
      // request comes from 127.0.0.1; the limiter itself is tested directly in rate-limit.test.ts.
      VOICE_SESSIONS_PER_USER_PER_DAY: "3",
      VOICE_SESSIONS_PER_DAY: "30",
      REGISTRATIONS_PER_IP_PER_HOUR: "100000",
      LOGIN_ATTEMPTS_PER_IP_PER_15_MIN: "100000",
    },
    globalSetup: ["./test/global-setup.ts"],
    // All test files share one database, so run them one after another.
    fileParallelism: false,
  },
});
