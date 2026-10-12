import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import {
  createTestUser,
  resetDatabase,
  type TestUser,
  ticketListResponseSchema,
  ticketResponseSchema,
  validTicket,
} from "./helpers.js";

// Who may see and change which tickets. These are the tests that catch IDOR:
// "logged in" is not the same as "allowed to see this ticket".

let alice: TestUser; // customer
let bob: TestUser; // another customer
let agent: TestUser; // support staff

beforeEach(async () => {
  await resetDatabase();
  [alice, bob, agent] = await Promise.all([
    createTestUser("customer"),
    createTestUser("customer"),
    createTestUser("agent"),
  ]);
});
afterAll(() => prisma.$disconnect());

async function createTicketAs(user: TestUser, overrides: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/tickets").set(user.auth).send({ ...validTicket, ...overrides });
  expect(res.status).toBe(201);
  return ticketResponseSchema.parse(res.body).data;
}

describe("authentication is required", () => {
  it.each([
    ["POST", "/api/tickets"],
    ["GET", "/api/tickets"],
    ["GET", "/api/tickets/00000000-0000-4000-8000-000000000000"],
    ["PATCH", "/api/tickets/00000000-0000-4000-8000-000000000000"],
  ])("%s %s returns 401 without a token", async (method, path) => {
    const res = await request(app)[method === "POST" ? "post" : method === "PATCH" ? "patch" : "get"](path).send({});
    expect(res.status).toBe(401);
  });
});

describe("customers only see their own tickets", () => {
  it("lists only the caller's tickets", async () => {
    await createTicketAs(alice);
    await createTicketAs(alice);
    await createTicketAs(bob);

    const res = await request(app).get("/api/tickets").set(alice.auth);
    const body = ticketListResponseSchema.parse(res.body);

    expect(body.data).toHaveLength(2);
    expect(body.data.every((t) => t.userId === alice.id)).toBe(true);
  });

  it("paginates within the caller's tickets only", async () => {
    for (let i = 0; i < 5; i++) await createTicketAs(alice);
    for (let i = 0; i < 5; i++) await createTicketAs(bob);

    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const res = await request(app)
        .get(`/api/tickets?limit=2${cursor ? `&cursor=${cursor}` : ""}`)
        .set(alice.auth);
      const body = ticketListResponseSchema.parse(res.body);
      seen.push(...body.data.map((t) => t.userId));
      cursor = body.page.nextCursor;
    } while (cursor && seen.length < 50);

    expect(seen).toHaveLength(5);
    expect(seen.every((userId) => userId === alice.id)).toBe(true);
  });

  it("returns 404 for another customer's ticket, identical to a ticket that does not exist", async () => {
    const bobsTicket = await createTicketAs(bob);

    const notYours = await request(app).get(`/api/tickets/${bobsTicket.id}`).set(alice.auth);
    const nonexistent = await request(app)
      .get("/api/tickets/00000000-0000-4000-8000-000000000000")
      .set(alice.auth);

    expect(notYours.status).toBe(404);
    // Same body: the response must not reveal that Bob's ticket id exists.
    expect(notYours.body).toEqual(nonexistent.body);
  });

  it("cannot modify another customer's ticket, and the ticket is left untouched", async () => {
    const bobsTicket = await createTicketAs(bob);

    const res = await request(app)
      .patch(`/api/tickets/${bobsTicket.id}`)
      .set(alice.auth)
      .send({ subject: "Hijacked by Alice" });

    expect(res.status).toBe(404);
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: bobsTicket.id } });
    expect(stored.subject).toBe(validTicket.subject);
  });
});

describe("customers cannot triage", () => {
  it("can edit the subject and description of their own ticket", async () => {
    const ticket = await createTicketAs(alice);
    const res = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .set(alice.auth)
      .send({ subject: "Still cannot log in", description: "Tried again today" });

    expect(res.status).toBe(200);
    expect(res.body.data.subject).toBe("Still cannot log in");
  });

  it("gets 403 when setting priority on create, and no ticket is created", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set(alice.auth)
      .send({ ...validTicket, priority: "urgent" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: "FORBIDDEN", details: { fields: ["priority"] } });
    expect(await prisma.ticket.count()).toBe(0);
  });

  it.each([
    [{ status: "resolved" }, ["status"]],
    [{ priority: "urgent" }, ["priority"]],
    [{ subject: "Allowed", status: "closed" }, ["status"]],
  ])("gets 403 for %j on their own ticket, and nothing changes", async (changes, fields) => {
    const ticket = await createTicketAs(alice);

    const res = await request(app).patch(`/api/tickets/${ticket.id}`).set(alice.auth).send(changes);

    expect(res.status).toBe(403);
    expect(res.body.error.details.fields).toEqual(fields);
    // All-or-nothing: the allowed part of a partly-forbidden update is not applied either.
    const stored = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(stored).toMatchObject({ subject: validTicket.subject, status: "open", priority: "medium" });
  });
});

describe("agents", () => {
  it("see every customer's tickets", async () => {
    await createTicketAs(alice);
    await createTicketAs(bob);

    const body = ticketListResponseSchema.parse((await request(app).get("/api/tickets").set(agent.auth)).body);
    expect(new Set(body.data.map((t) => t.userId))).toEqual(new Set([alice.id, bob.id]));
  });

  it("can triage any customer's ticket without taking ownership of it", async () => {
    const ticket = await createTicketAs(alice);

    const res = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .set(agent.auth)
      .send({ status: "in_progress", priority: "high" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "in_progress", priority: "high", userId: alice.id });
  });
});

describe("role changes", () => {
  it("take effect on the next request, without logging in again", async () => {
    const bobsTicket = await createTicketAs(bob);
    expect((await request(app).get(`/api/tickets/${bobsTicket.id}`).set(alice.auth)).status).toBe(404);

    await prisma.user.update({ where: { id: alice.id }, data: { role: "agent" } });
    expect((await request(app).get(`/api/tickets/${bobsTicket.id}`).set(alice.auth)).status).toBe(200);

    await prisma.user.update({ where: { id: alice.id }, data: { role: "customer" } });
    expect((await request(app).get(`/api/tickets/${bobsTicket.id}`).set(alice.auth)).status).toBe(404);
  });
});
