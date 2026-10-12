import { Router } from "express";
import { getAuth, requireUserOrVoiceAgent } from "../auth/require-auth.js";
import { AppError } from "../errors.js";
import { parseInput } from "../validation.js";
import { assertCanWriteFields, ticketScope } from "./ticket.policy.js";
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  ticketNumberParamsSchema,
  updateTicketSchema,
} from "./ticket.schema.js";
import { createTicket, getTicketById, getTicketByNumber, listTickets, updateTicket } from "./ticket.store.js";

export const ticketRouter = Router();

// Every ticket route requires a logged-in user, or the voice agent acting for the user its room
// belongs to. Applied to the whole router so a new route cannot be added without it.
ticketRouter.use(requireUserOrVoiceAgent);

// The store returns undefined for a missing ticket; translating that into HTTP is the route's job.
// Also used for tickets that exist but belong to someone else: 404, not 403, so the response
// does not confirm that the id exists.
function ticketNotFound() {
  return new AppError(404, "TICKET_NOT_FOUND", "Ticket not found");
}

// Handlers only describe the happy path. parseInput, policy checks and ticketNotFound throw,
// and Express 5 forwards the rejected promise to errorHandler.
// Order in each handler: validate input (400) -> check permissions (403) -> query in scope (404).

// POST /api/tickets
ticketRouter.post("/", async (req, res) => {
  const { user } = getAuth(req);
  const input = parseInput(createTicketSchema, req.body, "body");
  assertCanWriteFields(user, input);
  const ticket = await createTicket(input, user.id);
  res.status(201).location(`/api/tickets/${ticket.id}`).json({ data: ticket });
});

// GET /api/tickets
ticketRouter.get("/", async (req, res) => {
  const { user } = getAuth(req);
  const query = parseInput(listTicketsQuerySchema, req.query, "query");
  const { tickets, nextCursor } = await listTickets(query, ticketScope(user));
  // nextCursor is null on the last page; clients pass it back as ?cursor= to get the next one.
  res.status(200).json({ data: tickets, page: { limit: query.limit, nextCursor } });
});

// GET /api/tickets/number/:number: the human-friendly lookup used on voice calls ("ticket 1042").
ticketRouter.get("/number/:number", async (req, res) => {
  const { user } = getAuth(req);
  const { number } = parseInput(ticketNumberParamsSchema, req.params, "params");
  const ticket = await getTicketByNumber(number, ticketScope(user));
  if (!ticket) {
    throw ticketNotFound();
  }
  res.status(200).json({ data: ticket });
});

// GET /api/tickets/:id
ticketRouter.get("/:id", async (req, res) => {
  const { user } = getAuth(req);
  const { id } = parseInput(ticketIdParamsSchema, req.params, "params");
  const ticket = await getTicketById(id, ticketScope(user));
  if (!ticket) {
    throw ticketNotFound();
  }
  res.status(200).json({ data: ticket });
});

// PATCH /api/tickets/:id
ticketRouter.patch("/:id", async (req, res) => {
  const { user } = getAuth(req);
  const { id } = parseInput(ticketIdParamsSchema, req.params, "params");
  const changes = parseInput(updateTicketSchema, req.body, "body");
  assertCanWriteFields(user, changes);
  const ticket = await updateTicket(id, changes, ticketScope(user));
  if (!ticket) {
    throw ticketNotFound();
  }
  res.status(200).json({ data: ticket });
});
