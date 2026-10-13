import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { createTestUser, resetDatabase, type TestUser, validTicket } from "./helpers.js";

let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  [alice, bob] = await Promise.all([createTestUser("customer"), createTestUser("customer")]);
});
afterAll(() => prisma.$disconnect());

function create(user: TestUser, key?: string, body: Record<string, unknown> = validTicket) {
  const req = request(app).post("/api/tickets").set(user.auth);
  return (key ? req.set("Idempotency-Key", key) : req).send(body);
}

describe("POST /api/tickets with Idempotency-Key", () => {
  it("returns the original ticket on a repeat, creating nothing", async () => {
    const first = await create(alice, "call-1:refund");
    const second = await create(alice, "call-1:refund");

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.headers["idempotent-replayed"]).toBe("true");
    expect(second.body.data).toEqual(first.body.data);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("creates exactly one ticket when the same request arrives concurrently", async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => create(alice, "race-key")));

    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 200, 201]);
    expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("rejects reusing a key for different content with 422 instead of silently returning the old ticket", async () => {
    await create(alice, "reused");
    const res = await create(alice, "reused", { ...validTicket, subject: "Something else entirely" });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("scopes keys per user: Bob using Alice's key creates his own ticket and never sees hers", async () => {
    const alices = await create(alice, "shared-key");
    const bobs = await create(bob, "shared-key");

    expect(bobs.status).toBe(201);
    expect(bobs.body.data.id).not.toBe(alices.body.data.id);
    expect(bobs.body.data.userId).toBe(bob.id);
  });

  it("without a key, every request creates a ticket (unchanged behaviour)", async () => {
    await create(alice);
    await create(alice);
    expect(await prisma.ticket.count()).toBe(2);
  });

  it("never exposes the stored key in responses", async () => {
    const res = await create(alice, "secret-ish-key");
    expect(res.body.data).not.toHaveProperty("idempotencyKey");
    expect(JSON.stringify(res.body)).not.toContain("secret-ish-key");
  });

  it.each(["", "has spaces", "x".repeat(65), "bad/char"])("rejects a malformed key %j with 400", async (key) => {
    const res = await request(app).post("/api/tickets").set(alice.auth).set("Idempotency-Key", key).send(validTicket);
    // Including an empty one: the client sent the header, so it is invalid rather than absent.
    expect(res.status).toBe(400);
    expect(res.body.error.details.part).toBe("headers");
  });
});
