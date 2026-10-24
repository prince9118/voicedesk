import { defineConfig } from "vitest/config";

// Component tests run in a simulated browser (jsdom). A separate file from vite.config.ts on purpose:
// tests need none of the build plugins, and the dev-server proxy has no place here.
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
    css: false,
  },
});
