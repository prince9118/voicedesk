import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { app } from "../src/app.js";
import { config } from "../src/config.js";
import { prisma } from "../src/db.js";
import { createTestUser, resetDatabase, type TestUser, ticketResponseSchema, validTicket } from "./helpers.js";

// The voice agent acts for a customer only through the room the API created for that customer.
// It presents its service key plus a room name; the API decides which user that means.

let alice: TestUser;
let bob: TestUser;

beforeEach(async () => {
  await resetDatabase();
  [alice, bob] = await Promise.all([createTestUser("customer"), createTestUser("customer")]);
});
afterAll(() => prisma.$disconnect());

async function startVoiceSession(user: TestUser): Promise<string> {
  const res = await request(app).post("/api/voice/sessions").set(user.auth);
  expect(res.status).toBe(201);
  return z.object({ data: z.object({ roomName: z.string() }) }).parse(res.body).data.roomName;
}

function asAgent(roomName: string, key: string = config.AGENT_API_KEY) {
  return { Authorization: `Agent ${key}`, "X-Voice-Room": roomName };
}

async function createTicketAs(user: TestUser) {
  const res = await request(app).post("/api/tickets").set(user.auth).send(validTicket);
  return ticketResponseSchema.parse(res.body).data;
}

describe("voice session binding", () => {
  it("records which user each room belongs to", async () => {
    const roomName = await startVoiceSession(alice);
    const stored = await prisma.voiceSession.findUniqueOrThrow({ where: { roomName } });

    expect(stored.userId).toBe(alice.id);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60 * 1000);
  });
});

describe("agent acting for the room's owner", () => {
  it("sees exactly what that customer would see, and nothing else", async () => {
    const alicesTicket = await createTicketAs(alice);
    const bobsTicket = await createTicketAs(bob);
    const room = await startVoiceSession(alice);

    const list = await request(app).get("/api/tickets").set(asAgent(room));
    expect(list.status).toBe(200);
    expect(list.body.data.map((t: { id: string }) => t.id)).toEqual([alicesTicket.id]);

    // Bob's ticket is invisible: same 404 the customer would get.
    expect((await request(app).get(`/api/tickets/${bobsTicket.id}`).set(asAgent(room))).status).toBe(404);
  });

  it("looks tickets up by their spoken number, scoped to the customer", async () => {
    const alicesTicket = await createTicketAs(alice);
    const bobsTicket = await createTicketAs(bob);
    const numbers = await prisma.ticket.findMany({ select: { id: true, number: true } });
    const numberOf = (id: string) => numbers.find((t) => t.id === id)?.number;
    const room = await startVoiceSession(alice);

    const own = await request(app).get(`/api/tickets/number/${numberOf(alicesTicket.id)}`).set(asAgent(room));
    expect(own.status).toBe(200);
    expect(own.body.data.id).toBe(alicesTicket.id);

    const other = await request(app).get(`/api/tickets/number/${numberOf(bobsTicket.id)}`).set(asAgent(room));
    expect(other.status).toBe(404);
  });

  it("is bound by the customer's field rules (cannot triage)", async () => {
    const ticket = await createTicketAs(alice);
    const room = await startVoiceSession(alice);

    const res = await request(app).patch(`/api/tickets/${ticket.id}`).set(asAgent(room)).send({ status: "closed" });
    expect(res.status).toBe(403);
  });

  it("creates tickets owned by the customer, not by the agent", async () => {
    const room = await startVoiceSession(alice);
    const res = await request(app).post("/api/tickets").set(asAgent(room)).send(validTicket);

    expect(res.status).toBe(201);
    expect(res.body.data.userId).toBe(alice.id);
  });
});

describe("agent credentials are rejected when", () => {
  it.each([
    ["the key is wrong", (room: string) => asAgent(room, "x".repeat(50))],
    ["the room header is missing", () => ({ Authorization: `Agent ${config.AGENT_API_KEY}` })],
    ["the room name is malformed", () => asAgent("not-a-support-room")],
    ["the room was never created by the API", () => asAgent("support-00000000-0000-4000-8000-000000000000")],
    ["only the room is given, without the key", (room: string) => ({ "X-Voice-Room": room })],
  ])("%s", async (_label, headers) => {
    const room = await startVoiceSession(alice);
    const res = await request(app).get("/api/tickets").set(headers(room));
    expect(res.status).toBe(401);
  });

  it("the room's delegation has expired", async () => {
    const room = await startVoiceSession(alice);
    await prisma.voiceSession.update({ where: { roomName: room }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await request(app).get("/api/tickets").set(asAgent(room))).status).toBe(401);
  });

  it("used on account routes: the agent can never manage the user's login", async () => {
    const room = await startVoiceSession(alice);
    expect((await request(app).get("/api/auth/me").set(asAgent(room))).status).toBe(401);
    expect((await request(app).post("/api/auth/logout").set(asAgent(room))).status).toBe(401);
    expect((await request(app).post("/api/voice/sessions").set(asAgent(room))).status).toBe(401);
  });
});

describe("ticket numbers", () => {
  it("are unique and increasing", async () => {
    const created = [];
    for (let i = 0; i < 3; i++) created.push(await createTicketAs(alice));
    const rows = await prisma.ticket.findMany({ orderBy: { createdAt: "asc" }, select: { number: true } });
    const nums = rows.map((r) => r.number);

    expect(new Set(nums).size).toBe(3);
    expect([...nums].sort((a, b) => a - b)).toEqual(nums);
  });

  it.each(["0", "-1", "abc", "1.5", "99999999999"])("rejects number=%s with 400, not a 500", async (value) => {
    const res = await request(app).get(`/api/tickets/number/${value}`).set(alice.auth);
    expect(res.status).toBe(400);
  });
});
