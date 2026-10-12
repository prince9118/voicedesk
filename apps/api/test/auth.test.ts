import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { app } from "../src/app.js";
import { hashToken } from "../src/auth/session.js";
import { prisma } from "../src/db.js";
import { resetDatabase } from "./helpers.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

const asha = { email: "asha@example.com", name: "Asha", password: "correct horse battery" };

const sessionResponseSchema = z.object({
  data: z.object({
    user: z.strictObject({ id: z.uuid(), email: z.string(), name: z.string() }),
    token: z.string().length(43),
    expiresAt: z.iso.datetime(),
  }),
});

async function register(overrides: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/auth/register").send({ ...asha, ...overrides });
  expect(res.status).toBe(201);
  return sessionResponseSchema.parse(res.body).data;
}

describe("POST /api/auth/register", () => {
  it("creates a user, returns a session, and never exposes the password hash", async () => {
    const res = await request(app).post("/api/auth/register").send(asha);

    expect(res.status).toBe(201);
    // strictObject in the schema above fails if any extra field (e.g. passwordHash) is present.
    const { user } = sessionResponseSchema.parse(res.body).data;
    expect(user).toEqual({ id: user.id, email: asha.email, name: asha.name });
    expect(JSON.stringify(res.body)).not.toContain("scrypt$");
  });

  it("stores a salted scrypt hash, not the password", async () => {
    await register();
    await register({ email: "other@example.com" }); // same password, different user

    const users = await prisma.user.findMany({ select: { passwordHash: true } });
    for (const { passwordHash } of users) {
      expect(passwordHash).toMatch(/^scrypt\$15\$8\$3\$/);
      expect(passwordHash).not.toContain(asha.password);
    }
    // Different salts mean identical passwords produce different hashes.
    expect(users[0]?.passwordHash).not.toBe(users[1]?.passwordHash);
  });

  it("normalizes email so case and whitespace cannot create duplicate accounts", async () => {
    const { user } = await register({ email: "  Asha@Example.COM " });
    expect(user.email).toBe("asha@example.com");

    const dup = await request(app).post("/api/auth/register").send({ ...asha, email: "ASHA@example.com" });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("lets only one of two simultaneous registrations for the same email succeed", async () => {
    const [a, b] = await Promise.all([
      request(app).post("/api/auth/register").send(asha),
      request(app).post("/api/auth/register").send(asha),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await prisma.user.count()).toBe(1);
  });

  it.each([
    ["too short", { password: "short" }],
    ["too long", { password: "x".repeat(129) }],
    ["invalid email", { email: "not-an-email" }],
    ["empty name", { name: "   " }],
    ["unknown field", { role: "admin" }],
  ])("rejects invalid input (%s)", async (_label, overrides) => {
    const res = await request(app).post("/api/auth/register").send({ ...asha, ...overrides });
    expect(res.status).toBe(400);
    expect(await prisma.user.count()).toBe(0);
  });
});

describe("POST /api/auth/login", () => {
  it("returns a new session for valid credentials, with a case-insensitive email", async () => {
    await register();
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "ASHA@example.com", password: asha.password });

    expect(res.status).toBe(200);
    expect(sessionResponseSchema.parse(res.body).data.user.email).toBe(asha.email);
  });

  it("gives the same answer for a wrong password and an unknown email (no user enumeration)", async () => {
    await register();
    const wrongPassword = await request(app)
      .post("/api/auth/login")
      .send({ email: asha.email, password: "wrong password!!" });
    const unknownEmail = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "wrong password!!" });

    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body).toEqual(wrongPassword.body);
  });
});

describe("authenticated routes", () => {
  it("GET /me returns the current user for a valid token", async () => {
    const { token, user } = await register();
    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(user);
  });

  it.each([
    ["no header", undefined],
    ["wrong scheme", "Basic dXNlcjpwYXNz"],
    ["malformed token", "Bearer not-a-real-token"],
    ["well-formed but unknown token", `Bearer ${"A".repeat(43)}`],
  ])("returns 401 with WWW-Authenticate for %s", async (_label, header) => {
    const req = request(app).get("/api/auth/me");
    const res = await (header ? req.set("Authorization", header) : req);

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
    expect(res.headers["www-authenticate"]).toBe('Bearer realm="voicedesk"');
  });

  it("logout revokes the token immediately, and only that session", async () => {
    const first = await register();
    const second = sessionResponseSchema.parse(
      (await request(app).post("/api/auth/login").send({ email: asha.email, password: asha.password })).body,
    ).data;

    const logout = await request(app).post("/api/auth/logout").set("Authorization", `Bearer ${first.token}`);
    expect(logout.status).toBe(204);

    const revoked = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${first.token}`);
    expect(revoked.status).toBe(401);
    // The other device stays logged in.
    const stillValid = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${second.token}`);
    expect(stillValid.status).toBe(200);
  });

  it("rejects an expired session and deletes it", async () => {
    const { token } = await register();
    await prisma.session.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(await prisma.session.count()).toBe(0);
  });

  it("stores only a hash of the session token", async () => {
    const { token } = await register();
    const [session] = await prisma.session.findMany();

    expect(session?.tokenHash).toBe(hashToken(token));
    expect(session?.tokenHash).not.toBe(token);
  });
});
