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

export function isDatabaseUnavailableError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    DATABASE_UNAVAILABLE_CODES.has(err.code)
  );
}
