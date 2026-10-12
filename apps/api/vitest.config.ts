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
    },
    globalSetup: ["./test/global-setup.ts"],
    // All test files share one database, so run them one after another.
    fileParallelism: false,
  },
});
