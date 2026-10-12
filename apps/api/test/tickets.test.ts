import request from "supertest";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/db.js";
import { resetDatabase, ticketResponseSchema, validTicket } from "./helpers.js";

const MISSING_ID = "00000000-0000-4000-8000-000000000000";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

async function createTicket(overrides: Record<string, unknown> = {}) {
  const res = await request(app).post("/api/tickets").send({ ...validTicket, ...overrides });
  expect(res.status).toBe(201);
  return ticketResponseSchema.parse(res.body).data;
}

describe("POST /api/tickets", () => {
  it("creates a ticket with server-owned defaults and a Location header", async () => {
    const res = await request(app).post("/api/tickets").send(validTicket);

    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ ...validTicket, status: "open", priority: "medium" });
    expect(res.headers.location).toBe(`/api/tickets/${res.body.data.id}`);
    // Persisted, not just echoed back.
    expect(await prisma.ticket.count()).toBe(1);
  });

  it("reports every invalid field at once", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send({ subject: "  ", customerEmail: "not-an-email", priority: "critical" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(res.body.error.details.fieldErrors).sort()).toEqual(
      ["customerEmail", "description", "priority", "subject"],
    );
  });

  it("rejects server-owned fields such as status (mass assignment)", async () => {
    const res = await request(app).post("/api/tickets").send({ ...validTicket, status: "closed" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.formErrors).toEqual(['Unrecognized key: "status"']);
    expect(await prisma.ticket.count()).toBe(0);
  });

  // Regression tests: each of these used to pass validation and then fail as a 500.
  it("rejects an email longer than the 320-char column instead of failing in Postgres", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send({ ...validTicket, customerEmail: `${"a".repeat(330)}@example.com` });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.customerEmail).toBeDefined();
  });

  it("rejects NUL characters, which Postgres text columns cannot store", async () => {
    const res = await request(app).post("/api/tickets").send({ ...validTicket, subject: "Bad\u0000byte" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.fieldErrors.subject).toEqual(["Must not contain NUL characters"]);
  });

  it("returns 413 for a body over the size limit", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .send({ ...validTicket, description: "x".repeat(200_000) });

    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("returns 415 for an unsupported charset", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Content-Type", "application/json; charset=latin9")
      .send(JSON.stringify(validTicket));

    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe("UNSUPPORTED_MEDIA_TYPE");
  });

  it("returns 400 INVALID_JSON for a malformed body", async () => {
    const res = await request(app)
      .post("/api/tickets")
      .set("Content-Type", "application/json")
      .send("{bad json");

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_JSON");
  });
});

describe("GET /api/tickets/:id", () => {
  it("returns an existing ticket", async () => {
    const ticket = await createTicket();
    const res = await request(app).get(`/api/tickets/${ticket.id}`);

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(ticket.id);
  });

  it("returns 400 for a malformed id and 404 for a well-formed missing one", async () => {
    const malformed = await request(app).get("/api/tickets/abc");
    expect(malformed.status).toBe(400);
    expect(malformed.body.error.details.part).toBe("params");

    const missing = await request(app).get(`/api/tickets/${MISSING_ID}`);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("TICKET_NOT_FOUND");
  });
});

describe("PATCH /api/tickets/:id", () => {
  it("updates only the fields sent and bumps updatedAt", async () => {
    // Start from an updatedAt in the past. Creating through the API and patching straight after
    // can land in the same millisecond, which made "later than" fail at random (a flaky test).
    const longAgo = new Date("2020-01-01T00:00:00.000Z");
    const ticket = await prisma.ticket.create({
      data: { ...validTicket, createdAt: longAgo, updatedAt: longAgo },
    });

    const res = await request(app).patch(`/api/tickets/${ticket.id}`).send({ status: "in_progress" });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "in_progress", subject: validTicket.subject });
    expect(new Date(res.body.data.updatedAt).getTime()).toBeGreaterThan(longAgo.getTime());
  });

  it("rejects an empty body", async () => {
    const ticket = await createTicket();
    const res = await request(app).patch(`/api/tickets/${ticket.id}`).send({});

    expect(res.status).toBe(400);
    expect(res.body.error.details.formErrors).toEqual(["Provide at least one field to update"]);
  });

  it("refuses to change the owner email, with a single clear message", async () => {
    const ticket = await createTicket();
    const res = await request(app)
      .patch(`/api/tickets/${ticket.id}`)
      .send({ customerEmail: "x@evil.example" });

    expect(res.status).toBe(400);
    expect(res.body.error.details.formErrors).toEqual(['Unrecognized key: "customerEmail"']);
  });

  it("returns 404 for a missing ticket", async () => {
    const res = await request(app).patch(`/api/tickets/${MISSING_ID}`).send({ status: "closed" });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/tickets filters", () => {
  it("combines status and priority filters with AND", async () => {
    await createTicket({ priority: "high" });
    await createTicket({ priority: "low" });
    const resolved = await createTicket({ priority: "high" });
    await request(app).patch(`/api/tickets/${resolved.id}`).send({ status: "resolved" });

    const res = await request(app).get("/api/tickets?status=open&priority=high");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ status: "open", priority: "high" });
  });

  it("rejects unknown query keys instead of silently ignoring them", async () => {
    const res = await request(app).get("/api/tickets?stauts=open");
    expect(res.status).toBe(400);
  });
});
