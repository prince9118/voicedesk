import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { deleteExpiredSessions, startCleanupJob, VOICE_SESSION_RETENTION_MS } from "../src/maintenance.js";
import { createTestUser, resetDatabase, type TestUser } from "./helpers.js";

afterAll(() => prisma.$disconnect());

const HOUR = 3_600_000;
let user: TestUser;

beforeEach(async () => {
  await resetDatabase();
  user = await createTestUser("customer");
});

let roomCounter = 0;
function voiceSession(createdAgoMs: number, expiresInMs: number) {
  const now = Date.now();
  return prisma.voiceSession.create({
    data: {
      roomName: `support-00000000-0000-4000-8000-${String(++roomCounter).padStart(12, "0")}`,
      userId: user.id,
      createdAt: new Date(now - createdAgoMs),
      expiresAt: new Date(now + expiresInMs),
    },
  });
}

describe("deleteExpiredSessions", () => {
  it("removes expired login sessions and keeps live ones", async () => {
    // createTestUser made one live session. Add one that expired an hour ago.
    await prisma.session.create({ data: { tokenHash: "e".repeat(64), userId: user.id, expiresAt: new Date(Date.now() - HOUR) } });

    const removed = await deleteExpiredSessions();

    expect(removed.sessions).toBe(1);
    expect(await prisma.session.count()).toBe(1);
    // The surviving session still works.
    expect((await request(app).get("/api/auth/me").set(user.auth)).status).toBe(200);
  });

  it("removes call records only once they are older than the retention period", async () => {
    await voiceSession(VOICE_SESSION_RETENTION_MS + HOUR, -HOUR); // long gone
    const recent = await voiceSession(2 * HOUR, -HOUR); // delegation expired, but still inside the limit window

    const removed = await deleteExpiredSessions();

    expect(removed.voiceSessions).toBe(1);
    expect(await prisma.voiceSession.findMany({ select: { id: true } })).toEqual([{ id: recent.id }]);
  });

  it("never weakens the daily call limit: calls whose delegation expired still count", async () => {
    // Three calls started 2 hours ago: their one-hour agent delegation is over, but they are still
    // within the rolling 24 hours, so this user has used all 3 of today's calls.
    for (let i = 0; i < 3; i++) await voiceSession(2 * HOUR, -HOUR);

    await deleteExpiredSessions();

    const res = await request(app).post("/api/voice/sessions").set(user.auth);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("VOICE_LIMIT_REACHED");
  });

  it("is safe to run on empty tables", async () => {
    await resetDatabase();
    await expect(deleteExpiredSessions()).resolves.toEqual({ sessions: 0, voiceSessions: 0 });
  });
});

describe("startCleanupJob", () => {
  it("cleans immediately, keeps cleaning on the interval, and stops when asked", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const info = vi.fn();
      const stop = startCleanupJob({ info, error: vi.fn() }, 1_000);
      await prisma.session.create({ data: { tokenHash: "f".repeat(64), userId: user.id, expiresAt: new Date(Date.now() - HOUR) } });

      await vi.advanceTimersByTimeAsync(1_000); // one interval later, the new expired row is removed
      await vi.waitFor(() => expect(info).toHaveBeenCalledWith({ sessions: 1, voiceSessions: 0 }, "Removed expired sessions"));
      stop();

      await prisma.session.create({ data: { tokenHash: "d".repeat(64), userId: user.id, expiresAt: new Date(Date.now() - HOUR) } });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await prisma.session.count({ where: { tokenHash: "d".repeat(64) } })).toBe(1); // stopped: left alone
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs a failed run and keeps going instead of crashing the API", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    try {
      const error = vi.fn();
      vi.spyOn(prisma.session, "deleteMany").mockRejectedValueOnce(new Error("database is down"));

      const stop = startCleanupJob({ info: vi.fn(), error }, 1_000);
      await vi.waitFor(() => expect(error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.stringContaining("will retry")));
      stop();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });
});
