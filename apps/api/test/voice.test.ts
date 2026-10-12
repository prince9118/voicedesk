import { TokenVerifier, TrackSource } from "livekit-server-sdk";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { createTestUser, resetDatabase, type TestUser } from "./helpers.js";

const voiceSessionSchema = z.object({
  data: z.strictObject({
    serverUrl: z.string(),
    roomName: z.string(),
    participantToken: z.string(),
    expiresAt: z.iso.datetime(),
  }),
});

let alice: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await createTestUser("customer");
});
afterAll(() => prisma.$disconnect());

async function startSession(user: TestUser) {
  const res = await request(app).post("/api/voice/sessions").set(user.auth);
  expect(res.status).toBe(201);
  return { res, session: voiceSessionSchema.parse(res.body).data };
}

// Decode and verify the JWT exactly as LiveKit's server would: signature, expiry and claims.
function verify(token: string) {
  return new TokenVerifier(config.LIVEKIT_API_KEY, config.LIVEKIT_API_SECRET).verify(token);
}

describe("POST /api/voice/sessions", () => {
  it("requires authentication", async () => {
    const res = await request(app).post("/api/voice/sessions");
    expect(res.status).toBe(401);
  });

  it("issues a token signed with our secret for the logged-in user", async () => {
    const { session } = await startSession(alice);
    const claims = await verify(session.participantToken);

    // identity is the opaque user id, not the email: identities appear in LiveKit's logs.
    expect(claims.sub).toBe(alice.id);
    expect(claims.name).toBe("Test customer");
    expect(session.serverUrl).toBe(config.LIVEKIT_URL);
  });

  it("is rejected if signed with any other secret", async () => {
    const { session } = await startSession(alice);
    const attacker = new TokenVerifier(config.LIVEKIT_API_KEY, "some-other-secret-0123456789abcdef");
    await expect(attacker.verify(session.participantToken)).rejects.toThrow();
  });

  it("grants only what a voice-support caller needs (least privilege)", async () => {
    const { session } = await startSession(alice);
    const { video } = await verify(session.participantToken);

    expect(video).toEqual({
      room: session.roomName,
      roomJoin: true,
      canPublish: true,
      // We pass the enum TrackSource.MICROPHONE (2); the SDK writes LiveKit's wire format into
      // the JWT, which is the lowercase name. This asserts what LiveKit's server will read.
      canPublishSources: [TrackSource[TrackSource.MICROPHONE].toLowerCase()],
      canSubscribe: true,
      canPublishData: true,
    });
    // Explicitly: no admin, no creating or listing other rooms.
    expect(video?.roomAdmin).toBeUndefined();
    expect(video?.roomCreate).toBeUndefined();
    expect(video?.roomList).toBeUndefined();
  });

  it("expires after 10 minutes", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { session } = await startSession(alice);
    const { exp } = await verify(session.participantToken);

    expect(exp).toBeGreaterThanOrEqual(before + 600);
    expect(exp).toBeLessThanOrEqual(before + 602);
    expect(Math.abs(new Date(session.expiresAt).getTime() / 1000 - (exp ?? 0))).toBeLessThan(2);
  });

  it("creates a new, unguessable room for every call, so no two sessions share a room", async () => {
    const first = await startSession(alice);
    const second = await startSession(alice);
    const bob = await createTestUser("customer");
    const bobs = await startSession(bob);

    const rooms = [first.session.roomName, second.session.roomName, bobs.session.roomName];
    expect(new Set(rooms).size).toBe(3);
    for (const room of rooms) {
      expect(room).toMatch(/^support-[0-9a-f-]{36}$/);
    }
  });

  it("ignores any room name the client tries to choose", async () => {
    const res = await request(app)
      .post("/api/voice/sessions")
      .set(alice.auth)
      .send({ roomName: "support-someone-elses-room" });

    const session = voiceSessionSchema.parse(res.body).data;
    const { video } = await verify(session.participantToken);
    expect(video?.room).not.toBe("support-someone-elses-room");
  });

  it("never returns the API secret and is not cacheable", async () => {
    const { res } = await startSession(alice);
    expect(JSON.stringify(res.body)).not.toContain(config.LIVEKIT_API_SECRET);
    expect(res.headers["cache-control"]).toBe("no-store");
  });
});
