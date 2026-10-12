import { randomUUID } from "node:crypto";
import { AccessToken, RoomAgentDispatch, RoomConfiguration, TrackSource } from "livekit-server-sdk";
import type { AuthUser } from "../auth/session.js";
import { config } from "../config.js";

// The token is only checked when the client connects; LiveKit Cloud refreshes it for reconnects.
// A short lifetime means a leaked token is useless almost immediately.
const TOKEN_TTL_SECONDS = 10 * 60;

export interface VoiceSession {
  serverUrl: string;
  roomName: string;
  participantToken: string;
  expiresAt: Date;
}

// Issues a LiveKit token for a brand-new room that only this user is given access to.
export async function createVoiceSession(user: AuthUser): Promise<VoiceSession> {
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

  return {
    serverUrl: config.LIVEKIT_URL,
    roomName,
    participantToken: await token.toJwt(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_SECONDS * 1000),
  };
}
