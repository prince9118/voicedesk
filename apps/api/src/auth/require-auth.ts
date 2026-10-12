import { createHash, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "../config.js";
import { AppError } from "../errors.js";
import { findVoiceSessionUser } from "../voice/voice.service.js";
import { type AuthUser, findSessionUser, hashToken } from "./session.js";

// Who is making the request. A discriminated union: TypeScript only lets you read
// sessionTokenHash after checking kind === "session", and roomName after kind === "voice-agent".
export type AuthContext =
  | { kind: "session"; user: AuthUser; sessionTokenHash: string }
  // The voice agent acting for the user its room was created for. `user` is that customer, so every
  // ticket rule (scope, field permissions, 404s) applies exactly as if they made the call themselves.
  | { kind: "voice-agent"; user: AuthUser; roomName: string };

// Adds `req.auth` to Express's Request type (declaration merging). It is optional because only
// routes behind an auth middleware have it; handlers read it through getAuth(), which narrows the type.
declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

// Tokens we issue are 32 bytes in base64url: exactly 43 URL-safe characters.
// Anything else is rejected before it reaches the database.
const BEARER_TOKEN = /^Bearer ([A-Za-z0-9_-]{43})$/;
const AGENT_CREDENTIAL = /^Agent (\S+)$/;
// Room names are always created by the API as support-<uuid>.
const VOICE_ROOM = /^support-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function unauthorized(res: Response): AppError {
  // RFC 6750: a 401 for a bearer-protected resource tells the client which scheme to use.
  res.set("WWW-Authenticate", 'Bearer realm="voicedesk"');
  return new AppError(401, "UNAUTHENTICATED", "Authentication required");
}

async function authenticateSession(req: Request): Promise<AuthContext | undefined> {
  const token = BEARER_TOKEN.exec(req.headers.authorization ?? "")?.[1];
  if (!token) {
    return undefined;
  }
  const sessionTokenHash = hashToken(token);
  const user = await findSessionUser(sessionTokenHash);
  return user ? { kind: "session", user, sessionTokenHash } : undefined;
}

// Compare SHA-256 digests rather than the raw strings: digests always have the same length, so
// timingSafeEqual neither throws nor leaks the key's length, and timing reveals nothing about content.
function isAgentKey(candidate: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(candidate), digest(config.AGENT_API_KEY));
}

async function authenticateVoiceAgent(req: Request): Promise<AuthContext | undefined> {
  const key = AGENT_CREDENTIAL.exec(req.headers.authorization ?? "")?.[1];
  const roomName = req.headers["x-voice-room"];
  if (!key || !isAgentKey(key) || typeof roomName !== "string" || !VOICE_ROOM.test(roomName)) {
    return undefined;
  }
  // The agent names a room; the API decides whose room it is. The agent never names a user.
  const user = await findVoiceSessionUser(roomName);
  return user ? { kind: "voice-agent", user, roomName } : undefined;
}

// For routes only a logged-in person may use (account management, starting a voice session).
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = await authenticateSession(req);
  if (!auth) {
    throw unauthorized(res);
  }
  req.auth = auth;
  next();
}

// For routes the voice agent may call on the customer's behalf (tickets).
export async function requireUserOrVoiceAgent(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = req.headers.authorization?.startsWith("Agent ")
    ? await authenticateVoiceAgent(req)
    : await authenticateSession(req);
  if (!auth) {
    throw unauthorized(res);
  }
  req.auth = auth;
  next();
}

// For handlers mounted after an auth middleware. If auth is missing here, a route was wired without
// one: that is our bug, so it becomes a 500 rather than silently running unauthenticated.
export function getAuth(req: Request): AuthContext {
  if (!req.auth) {
    throw new Error("getAuth() called on a route without an auth middleware");
  }
  return req.auth;
}

// For handlers that need the login session itself (logout).
export function getSessionAuth(req: Request): Extract<AuthContext, { kind: "session" }> {
  const auth = getAuth(req);
  if (auth.kind !== "session") {
    throw new Error("getSessionAuth() called on a route that accepts non-session credentials");
  }
  return auth;
}
