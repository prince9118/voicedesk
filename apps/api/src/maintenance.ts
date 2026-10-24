import { prisma } from "./db.js";

// Housekeeping for rows that are useless once they have expired. Expired sessions and voice sessions
// are already *rejected* by the auth code; this removes them so the tables do not grow forever.

const HOUR_MS = 60 * 60 * 1000;

// voice_sessions double as the call-limit ledger: "calls in the last 24 hours" is counted from them
// (see voice.service.ts). A row's delegation expires after one hour, but the row must stay for the
// whole 24-hour window or the daily limit would quietly stop counting it. Keep two days: the window
// plus a day of margin for clock skew and a user reading their own history.
export const VOICE_SESSION_RETENTION_MS = 48 * HOUR_MS;

export interface CleanupResult {
  sessions: number;
  voiceSessions: number;
}

export async function deleteExpiredSessions(now: Date = new Date()): Promise<CleanupResult> {
  const [sessions, voiceSessions] = await Promise.all([
    // A login session is dead the moment it expires.
    prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }),
    // A call record is only dead once it can no longer count toward the daily limit.
    prisma.voiceSession.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - VOICE_SESSION_RETENTION_MS) } } }),
  ]);
  return { sessions: sessions.count, voiceSessions: voiceSessions.count };
}

interface CleanupLogger {
  info: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
}

// Runs once at startup, then every hour. A failed run (for example the database is briefly down) is
// logged and the next hour tries again: housekeeping must never crash the API. Returns a stop function.
export function startCleanupJob(log: CleanupLogger, intervalMs: number = HOUR_MS): () => void {
  let running = false;

  async function run() {
    if (running) return; // a slow run must not overlap the next tick
    running = true;
    try {
      const removed = await deleteExpiredSessions();
      if (removed.sessions > 0 || removed.voiceSessions > 0) log.info(removed, "Removed expired sessions");
    } catch (err) {
      log.error({ err }, "Cleanup of expired sessions failed; will retry at the next interval");
    } finally {
      running = false;
    }
  }

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref(); // the timer alone must not keep the process alive
  return () => clearInterval(timer);
}
