import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client.js";

// Relies on server.ts importing "dotenv/config" first. Milestone 3 replaces this with validated config.
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// One client for the whole process. It owns a connection pool; creating a client per
// request would exhaust Postgres connections under load.
const adapter = new PrismaPg({ connectionString });
export const prisma = new PrismaClient({ adapter });
