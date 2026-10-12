import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { Prisma } from "../src/generated/prisma/client.js";
import { createTestUser, resetDatabase, type TestUser } from "./helpers.js";

// Only ticket queries are mocked; authentication still hits the real sessions table.
let agent: TestUser;
beforeAll(async () => {
  await resetDatabase();
  agent = await createTestUser("agent");
});

afterEach(() => vi.restoreAllMocks());
afterAll(() => prisma.$disconnect());

// The same error the pg adapter throws when Postgres refuses connections (reproduced in step 3a).
function connectionRefused() {
  return new Prisma.PrismaClientKnownRequestError("connect ECONNREFUSED", {
    code: "ECONNREFUSED",
    clientVersion: Prisma.prismaVersion.client,
  });
}

describe("database outage", () => {
  it("returns 503 with Retry-After instead of 500", async () => {
    vi.spyOn(prisma.ticket, "findMany").mockRejectedValueOnce(connectionRefused());

    const res = await request(app).get("/api/tickets").set(agent.auth);

    expect(res.status).toBe(503);
    expect(res.headers["retry-after"]).toBe("5");
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  // Regression test: pg-pool's timeouts are plain Errors with no code and used to become 500s.
  it.each([
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect",
  ])("returns 503 when the connection pool times out (%s)", async (message) => {
    vi.spyOn(prisma.ticket, "findMany").mockRejectedValueOnce(new Error(message));

    const res = await request(app).get("/api/tickets").set(agent.auth);

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("SERVICE_UNAVAILABLE");
  });

  it("still validates input before touching the database", async () => {
    const findMany = vi.spyOn(prisma.ticket, "findMany");

    const res = await request(app).get("/api/tickets?limit=0").set(agent.auth);

    expect(res.status).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });

  it("keeps /health up (liveness) while /ready reports the outage (readiness)", async () => {
    vi.spyOn(prisma, "$queryRaw").mockRejectedValueOnce(connectionRefused());

    expect((await request(app).get("/health")).status).toBe(200);
    const ready = await request(app).get("/ready");
    expect(ready.status).toBe(503);
    expect(ready.body.checks.database).toBe("down");
  });
});

describe("unexpected errors", () => {
  it("returns a generic 500 without leaking internal details", async () => {
    vi.spyOn(prisma.ticket, "findMany").mockRejectedValueOnce(
      new Error("relation \"tickets\" does not exist at db-host-01:5432"),
    );

    const res = await request(app).get("/api/tickets").set(agent.auth);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
    expect(JSON.stringify(res.body)).not.toContain("db-host-01");
  });
});

describe("routing and request ids", () => {
  it("returns JSON 404 for unknown routes", async () => {
    const res = await request(app).get("/api/nope");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("keeps a safe caller-supplied request id and replaces an unsafe one", async () => {
    const safe = await request(app).get("/health").set("X-Request-Id", "agent-call-42");
    expect(safe.headers["x-request-id"]).toBe("agent-call-42");

    const unsafe = await request(app).get("/health").set("X-Request-Id", "bad id\twith tab");
    expect(unsafe.headers["x-request-id"]).not.toBe("bad id\twith tab");
    expect(unsafe.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
