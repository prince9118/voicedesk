// Shared by vitest.config.ts and global-setup.ts so both point at the same database.
// CI can override it; locally it is a separate database in the same Docker container.
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://voicedesk:voicedesk@localhost:5432/voicedesk_test";

// Tests delete data. Refuse to run against anything that is not clearly a test database,
// so a misconfigured env var cannot wipe development (or production) data.
export function assertTestDatabase(url: string): void {
  const dbName = new URL(url).pathname.slice(1);
  if (!dbName.endsWith("_test")) {
    throw new Error(`Refusing to run tests against database "${dbName}": name must end with "_test"`);
  }
}
