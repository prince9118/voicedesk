import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "./config.js";
import { Prisma, PrismaClient } from "./generated/prisma/client.js";

// One client for the whole process. It owns a connection pool; creating a client per
// request would exhaust Postgres connections under load.
const adapter = new PrismaPg({
  connectionString: config.DATABASE_URL,
  // pg waits forever for a connection by default. Without this, a hung database
  // makes every request hang instead of failing.
  connectionTimeoutMillis: 5_000,
});
export const prisma = new PrismaClient({ adapter });

// Error codes that mean "the database is unreachable right now", so a retry may succeed.
// ECONNREFUSED and P1017 were reproduced locally with the pg adapter; the rest are the
// documented Prisma and Node equivalents for unreachable hosts, dropped connections and timeouts.
const DATABASE_UNAVAILABLE_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "P1001", // can't reach database server
  "P1017", // server has closed the connection
  "P2024", // timed out fetching a connection from the pool
]);

// pg-pool (8.x) reports its two timeouts as plain Errors with no code, and they reach us
// unwrapped by Prisma, so the message is the only signal. Reproduced against a non-routable host.
// pg is pinned to an exact version so these strings cannot change under us unnoticed.
const PG_POOL_TIMEOUT_MESSAGES = new Set([
  "Connection terminated due to connection timeout", // opening a new connection exceeded connectionTimeoutMillis
  "timeout exceeded when trying to connect", // waited too long for a free connection in a full pool
]);

export function isDatabaseUnavailableError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return DATABASE_UNAVAILABLE_CODES.has(err.code);
  }
  return err instanceof Error && PG_POOL_TIMEOUT_MESSAGES.has(err.message);
}
