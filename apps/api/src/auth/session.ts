import { createHash, randomBytes } from "node:crypto";
import { prisma } from "../db.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// What the rest of the API knows about the logged-in user. Never includes the password hash.
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// Prisma `select` used for every user read that leaves this module, so passwordHash is
// excluded by construction rather than by remembering to delete it.
export const publicUserSelect = { id: true, email: true, name: true } as const;

// 32 random bytes = 256 bits: unguessable, so a fast hash (SHA-256) is enough to store it.
// Slow hashes are only needed for low-entropy secrets like passwords.
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { tokenHash: hashToken(token), userId, expiresAt } });
  return { token, expiresAt };
}

// Returns the session's user, or undefined if the token is unknown or expired.
export async function findSessionUser(tokenHash: string): Promise<AuthUser | undefined> {
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    select: { expiresAt: true, user: { select: publicUserSelect } },
  });
  if (!session) {
    return undefined;
  }
  if (session.expiresAt <= new Date()) {
    // deleteMany, not delete: a concurrent request may have removed it already.
    await prisma.session.deleteMany({ where: { tokenHash } });
    return undefined;
  }
  return session.user;
}

export async function deleteSession(tokenHash: string): Promise<void> {
  await prisma.session.deleteMany({ where: { tokenHash } });
}
