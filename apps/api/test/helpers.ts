import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSession, type Role } from "../src/auth/session.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { assertTestDatabase } from "./test-env.js";

// Empty every table so each test starts from a known state, independent of test order.
export async function resetDatabase(): Promise<void> {
  // Checked again here, against the URL the app actually connected with.
  assertTestDatabase(config.DATABASE_URL);
  await prisma.$executeRaw`TRUNCATE TABLE tickets, sessions, voice_sessions, users, kb_chunks, kb_documents`;
}

export interface TestUser {
  id: string;
  role: Role;
  // Ready to pass to supertest: .set(user.auth)
  auth: { Authorization: string };
}

// Creates a user and a session directly in the database. Going through /register would hash a
// password (~225 ms) for every test; auth.test.ts already covers that path end to end.
export async function createTestUser(role: Role = "customer"): Promise<TestUser> {
  const user = await prisma.user.create({
    data: {
      email: `${role}-${randomUUID()}@example.com`,
      name: `Test ${role}`,
      passwordHash: "not-a-real-hash",
      role,
    },
  });
  const { token } = await createSession(user.id);
  return { id: user.id, role, auth: { Authorization: `Bearer ${token}` } };
}

// supertest types res.body as `any`. Parsing it pulls out typed values and also asserts
// the response contract, instead of trusting the shape.
export const ticketResponseSchema = z.object({
  data: z.looseObject({ id: z.uuid(), userId: z.uuid(), updatedAt: z.iso.datetime() }),
});

export const ticketListResponseSchema = z.object({
  data: z.array(z.looseObject({ id: z.uuid(), userId: z.uuid() })),
  page: z.object({ limit: z.number(), nextCursor: z.string().nullable() }),
});

export const validTicket = {
  subject: "Cannot log in",
  description: "Password reset email never arrives",
};
