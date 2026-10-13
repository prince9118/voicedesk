import express from "express";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { errorHandler } from "../src/error-handler.js";
import { rateLimit } from "../src/rate-limit.js";
import { createTestUser, resetDatabase, type TestUser } from "./helpers.js";

afterAll(() => prisma.$disconnect());

describe("rateLimit (per-IP fixed window)", () => {
  function appWithLimit(max: number, now: () => number) {
    const small = express();
    small.post("/", rateLimit({ windowMs: 60_000, max, now }), (_req, res) => res.status(204).end());
    small.use(errorHandler);
    return small;
  }

  it("allows up to max requests, then answers 429 with Retry-After", async () => {
    const t = 1_000_000;
    const limited = appWithLimit(2, () => t);

    expect((await request(limited).post("/")).status).toBe(204);
    expect((await request(limited).post("/")).status).toBe(204);
    const blocked = await request(limited).post("/");
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe("RATE_LIMITED");
    expect(blocked.headers["retry-after"]).toBe("60");
  });

  it("starts a fresh window once the old one has passed", async () => {
    let t = 1_000_000;
    const limited = appWithLimit(1, () => t);

    expect((await request(limited).post("/")).status).toBe(204);
    expect((await request(limited).post("/")).status).toBe(429);
    t += 60_001;
    expect((await request(limited).post("/")).status).toBe(204);
  });
});

describe("voice call limits", () => {
  let alice: TestUser;

  beforeEach(async () => {
    await resetDatabase();
    alice = await createTestUser("customer");
  });

  const start = (user: TestUser) => request(app).post("/api/voice/sessions").set(user.auth);

  it("allows 3 calls per user per day, then 429 VOICE_LIMIT_REACHED with Retry-After", async () => {
    for (let i = 0; i < 3; i++) expect((await start(alice)).status).toBe(201);

    const fourth = await start(alice);
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe("VOICE_LIMIT_REACHED");
    expect(Number(fourth.headers["retry-after"])).toBeGreaterThan(23 * 3600);
  });

  it("lets exactly 3 of 5 simultaneous requests through (the advisory lock prevents overshoot)", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => start(alice)));

    expect(results.map((r) => r.status).sort()).toEqual([201, 201, 201, 429, 429]);
    expect(await prisma.voiceSession.count({ where: { userId: alice.id } })).toBe(3);
  });

  it("counts only the last 24 hours", async () => {
    for (let i = 0; i < 3; i++) await start(alice);
    await prisma.voiceSession.updateMany({ data: { createdAt: new Date(Date.now() - 25 * 3600 * 1000) } });

    expect((await start(alice)).status).toBe(201);
  });

  it("limits each user separately", async () => {
    for (let i = 0; i < 3; i++) await start(alice);
    const bob = await createTestUser("customer");

    expect((await start(bob)).status).toBe(201);
  });

  it("stops all new calls when the site-wide daily budget is used (429 VOICE_CAPACITY_REACHED)", async () => {
    const others = await Promise.all(Array.from({ length: 10 }, () => createTestUser("customer")));
    await prisma.voiceSession.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        roomName: `support-00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
        userId: others[i % others.length]?.id ?? alice.id,
        expiresAt: new Date(Date.now() + 3600_000),
      })),
    });

    const res = await start(alice);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("VOICE_CAPACITY_REACHED");
  });
});
