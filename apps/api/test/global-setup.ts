import { execSync } from "node:child_process";
import { assertTestDatabase, TEST_DATABASE_URL } from "./test-env.js";

// Runs once before all test files: bring the test database schema up to date with the
// committed migrations, the same command a production deploy would use.
export default function setup(): void {
  assertTestDatabase(TEST_DATABASE_URL);
  execSync("npx --no-install prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
  });
}
