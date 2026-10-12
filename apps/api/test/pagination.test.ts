import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { encodeCursor } from "../src/tickets/ticket.cursor.js";
import { resetDatabase, ticketListResponseSchema } from "./helpers.js";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

// 25 tickets; the first 10 share one timestamp, which is the case that breaks naive pagination.
async function seedTickets() {
  const tied = new Date("2030-01-01T00:00:00.000Z");
  await prisma.ticket.createMany({
    data: Array.from({ length: 25 }, (_, i) => ({
      subject: `Seeded ticket ${i}`,
      description: "d",
      customerEmail: "seed@example.com",
      status: i % 2 === 0 ? "open" : "closed",
      createdAt: i < 10 ? tied : new Date(tied.getTime() + i * 60_000),
    })),
  });
}

async function collectAllPages(query: string) {
  const ids: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const url = `/api/tickets?limit=3${query}${cursor ? `&cursor=${cursor}` : ""}`;
    const res = await request(app).get(url);
    expect(res.status).toBe(200);
    const body = ticketListResponseSchema.parse(res.body);
    ids.push(...body.data.map((t) => t.id));
    cursor = body.page.nextCursor;
    pages++;
  } while (cursor && pages < 100); // bound the loop so a cursor bug fails instead of hanging
  return { ids, pages };
}

describe("GET /api/tickets pagination", () => {
  it.each([
    ["no filter", ""],
    ["status filter", "&status=open"],
  ])("returns every ticket exactly once, in order, across pages (%s)", async (_label, query) => {
    await seedTickets();

    const { ids, pages } = await collectAllPages(query);
    const single = ticketListResponseSchema.parse(
      (await request(app).get(`/api/tickets?limit=100${query}`)).body,
    );

    expect(new Set(ids).size).toBe(ids.length); // no duplicates
    expect(ids).toEqual(single.data.map((t) => t.id)); // nothing skipped, same order
    expect(pages).toBe(Math.ceil(ids.length / 3));
    expect(single.page.nextCursor).toBeNull();
  });

  it("defaults to 20 per page and reports the limit", async () => {
    await seedTickets();
    const body = ticketListResponseSchema.parse((await request(app).get("/api/tickets")).body);

    expect(body.data).toHaveLength(20);
    expect(body.page.limit).toBe(20);
    expect(body.page.nextCursor).not.toBeNull();
  });

  it.each(["0", "101", "abc"])("rejects limit=%s", async (limit) => {
    const res = await request(app).get(`/api/tickets?limit=${limit}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.limit).toBeDefined();
  });

  it.each([
    ["not base64 JSON", "bm90LWpzb24"],
    ["valid JSON, wrong shape", Buffer.from('{"createdAt":"yesterday","id":"x"}').toString("base64url")],
  ])("rejects a tampered cursor (%s)", async (_label, cursor) => {
    const res = await request(app).get(`/api/tickets?cursor=${cursor}`);
    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.cursor).toEqual(["Invalid cursor"]);
  });

  it("round-trips a cursor without losing millisecond precision", () => {
    const createdAt = new Date("2030-01-01T00:00:00.123Z");
    const decoded = JSON.parse(
      Buffer.from(encodeCursor({ createdAt, id: "x" }), "base64url").toString("utf8"),
    );
    expect(decoded.createdAt).toBe("2030-01-01T00:00:00.123Z");
  });
});
