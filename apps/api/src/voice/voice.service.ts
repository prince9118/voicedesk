import { randomUUID } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import { type AuthUser, publicUserSelect } from "../auth/session.js";
import { config } from "../config.js";
import { prisma } from "../db.js";
import type { Prisma } from "../generated/prisma/client.js";

// The token is only checked when the client connects; LiveKit Cloud refreshes it for reconnects.
// A short lifetime means a leaked token is useless almost immediately.
const TOKEN_TTL_SECONDS = 10 * 60;

// How long the voice agent may act for the user from this room: the maximum call length.
const AGENT_DELEGATION_TTL_MS = 60 * 60 * 1000;

export interface VoiceSession {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  expiresAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export type StartVoiceSessionResult =
  | { kind: "started"; session: VoiceSession }
  // This user used their daily calls; retryAfterSeconds is when the oldest one leaves the window.
  | { kind: "user_limit"; retryAfterSeconds: number }
  // The whole site reached its daily call budget (protects the LiveKit credit).
  | { kind: "capacity" };

// Enforces the call limits, then issues the session. Every call costs LiveKit credit, so limits are
// counted in Postgres (they survive restarts) over a rolling 24 hours.
export async function startVoiceSession(user: AuthUser): Promise<StartVoiceSessionResult> {
  return prisma.$transaction(async (tx) => {
    // Serialize this user's requests: without the lock, two simultaneous requests could both
    // count 2 of 3 and both start, ending at 4. The lock is released when the transaction ends.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id}))`;

    const since = new Date(Date.now() - DAY_MS);
    const [mine, total] = await Promise.all([
      tx.voiceSession.findMany({
        where: { userId: user.id, createdAt: { gte: since } },
        select: { createdAt: true },
        orderBy: { createdAt: "asc" },
      }),
      tx.voiceSession.count({ where: { createdAt: { gte: since } } }),
    ]);

    if (mine.length >= config.VOICE_SESSIONS_PER_USER_PER_DAY) {
      const oldest = mine[0]?.createdAt.getTime() ?? Date.now();
      return { kind: "user_limit", retryAfterSeconds: Math.max(1, Math.ceil((oldest + DAY_MS - Date.now()) / 1000)) };
    }
    if (total >= config.VOICE_SESSIONS_PER_DAY) {
      return { kind: "capacity" };
    }
    return { kind: "started", session: await createVoiceSession(user, tx) };
  });
}

// Issues a LiveKit token for a brand-new room that only this user is given access to.
// Called inside startVoiceSession's transaction, so the room binding is part of the limit check.
async function createVoiceSession(user: AuthUser, tx: Prisma.TransactionClient): Promise<VoiceSession> {
  // The server picks the room, never the client: otherwise a user could request a token for
  // someone else's conversation. Random and free of personal data, as LiveKit recommends,
  // because room names and identities appear in LiveKit's logs.
  const roomName = `support-${randomUUID()}`;

  const token = new AccessToken(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET, {
    identity: user.id,
    name: user.name,
    ttl: TOKEN_TTL_SECONDS,
  });

  // Least privilege: join this one room, talk, listen, and exchange data messages
  // (used later for transcripts). No camera or screen share, no admin rights.
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canPublishSources: [TrackSource.MICROPHONE],
    canSubscribe: true,
    canPublishData: true,
  });

  // Explicit dispatch: when this token creates the room, LiveKit sends our voice agent into it.
  // Applied only on room creation, which is always the case here because the room name is new.
  token.roomConfig = new RoomConfiguration({
    agents: [new RoomAgentDispatch({ agentName: config.LIVEKIT_AGENT_NAME })],
  });

  // Record which user this room belongs to before handing out the token, so by the time the agent
  // joins and calls the API, the binding exists.
  await tx.voiceSession.create({
    data: { roomName, userId: user.id, expiresAt: new Date(Date.now() + AGENT_DELEGATION_TTL_MS) },
  });

  return {
    serverUrl: config.LIVEKIT_URL,
    roomName,
    participantToken: await token.toJwt(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
  };
}

// The user a room was created for, if the room is known and its delegation has not expired.
// Used to authenticate the voice agent (see auth/require-auth.ts).
export async function findVoiceSessionUser(roomName: string): Promise<AuthUser | undefined> {
  const session = await prisma.voiceSession.findUnique({
    where: { roomName },
    select: { expiresAt: true, user: { select: publicUserSelect } },
  });
  if (!session || session.expiresAt <= new Date()) {
    return undefined;
  }
  return session.user;
}
