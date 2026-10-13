import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { parseArticle } from "../src/kb/chunking.js";
import { toOrQuery } from "../src/kb/kb.search.js";
import { createTestUser, resetDatabase, type TestUser } from "./helpers.js";

const REFUNDS = `# Refunds

## How long a refund takes
Once a refund is approved, banks usually take 5 to 10 business days to show it on your statement.

## Refund not received
If more than 10 business days have passed, open a support ticket with the charge date.`;

const PASSWORDS = `# Resetting your password

## The reset email did not arrive
Check your spam folder. Reset emails usually arrive within two minutes.`;

async function seed(slug: string, markdown: string) {
  const article = parseArticle(markdown, slug);
  await prisma.kbDocument.create({
    data: {
      slug,
      title: article.title,
      contentHash: "0".repeat(64),
      chunks: { create: article.chunks.map((chunk, position) => ({ ...chunk, position })) },
    },
  });
}

const searchResponseSchema = z.object({
  data: z.array(
    z.strictObject({
      source: z.object({ slug: z.string(), title: z.string() }),
      heading: z.string(),
      content: z.string(),
      score: z.number(),
    }),
  ),
});

let alice: TestUser;

beforeEach(async () => {
  await resetDatabase();
  alice = await createTestUser("customer");
  await seed("refunds", REFUNDS);
  await seed("password-reset", PASSWORDS);
});
afterAll(() => prisma.$disconnect());

function search(q: string) {
  return request(app).get("/api/kb/search").query({ q }).set(alice.auth);
}

describe("parseArticle", () => {
  it("uses the # title and makes one chunk per ## section", () => {
    const article = parseArticle(REFUNDS, "fallback");
    expect(article.title).toBe("Refunds");
    expect(article.chunks.map((c) => c.heading)).toEqual(["How long a refund takes", "Refund not received"]);
  });

  it("splits an over-long section on paragraph boundaries", () => {
    const long = `# T\n\n## S\n${Array.from({ length: 6 }, (_, i) => `Paragraph ${i} ${"x".repeat(400)}`).join("\n\n")}`;
    const { chunks } = parseArticle(long, "t");
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 1200)).toBe(true);
    expect(chunks.every((c) => c.heading === "S")).toBe(true);
  });
});

describe("toOrQuery", () => {
  it("keeps only words, so tsquery operators in the input cannot reach Postgres", () => {
    expect(toOrQuery("refund & !(x) | 'money':*")).toBe("refund | x | money");
    expect(toOrQuery("!!! ???")).toBeUndefined();
  });
});

describe("GET /api/kb/search", () => {
  it("returns the matching passage with its source, so answers are traceable", async () => {
    const res = await search("refund not received");
    const { data } = searchResponseSchema.parse(res.body);

    expect(res.status).toBe(200);
    expect(data[0]).toMatchObject({ source: { slug: "refunds", title: "Refunds" }, heading: "Refund not received" });
  });

  it("matches word forms through stemming (refunded -> refund, emails -> email)", async () => {
    const { data } = searchResponseSchema.parse((await search("refunded emails")).body);
    expect(data.map((d) => d.source.slug)).toEqual(expect.arrayContaining(["refunds", "password-reset"]));
  });

  it("returns an empty list, not a weak match, when nothing is relevant", async () => {
    const res = await search("weather forecast tomorrow");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  it.each(["refund & !(x", "'):* <-> |||", "\u0000", "a".repeat(300)])("never fails with a 500 on hostile input %#", async (q) => {
    const res = await search(q);
    expect(res.status).not.toBe(500);
  });

  it("validates the query string", async () => {
    expect((await search("")).status).toBe(400);
    expect((await search("x".repeat(301))).status).toBe(400);
  });

  it("requires authentication, and accepts the voice agent acting for a room", async () => {
    expect((await request(app).get("/api/kb/search").query({ q: "refund" })).status).toBe(401);

    const voice = await request(app).post("/api/voice/sessions").set(alice.auth);
    const res = await request(app)
      .get("/api/kb/search")
      .query({ q: "refund" })
      .set({ Authorization: `Agent ${config.AGENT_API_KEY}`, "X-Voice-Room": voice.body.data.roomName });
    expect(res.status).toBe(200);
  });
});
