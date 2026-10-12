import { z } from "zod";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { assertTestDatabase } from "./test-env.js";

// Empty every table so each test starts from a known state, independent of test order.
export async function resetDatabase(): Promise<void> {
  // Checked again here, against the URL the app actually connected with.
  assertTestDatabase(config.DATABASE_URL);
  await prisma.$executeRaw`TRUNCATE TABLE tickets`;
}

// supertest types res.body as `any`. Parsing it pulls out typed values and also asserts
// the response contract, instead of trusting the shape.
export const ticketResponseSchema = z.object({
  data: z.looseObject({ id: z.uuid(), updatedAt: z.iso.datetime() }),
});

export const ticketListResponseSchema = z.object({
  data: z.array(z.looseObject({ id: z.uuid() })),
  page: z.object({ limit: z.number(), nextCursor: z.string().nullable() }),
});

export const validTicket = {
  subject: "Cannot log in",
  description: "Password reset email never arrives",
  customerEmail: "asha@example.com",
};
