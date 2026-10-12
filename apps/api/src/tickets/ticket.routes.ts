import { Router } from "express";
import { AppError } from "../errors.js";
import { parseInput } from "../validation.js";
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
} from "./ticket.schema.js";
import { createTicket, getTicketById, listTickets, updateTicket } from "./ticket.store.js";

export const ticketRouter = Router();

// The store returns undefined for a missing ticket; translating that into HTTP is the route's job.
function ticketNotFound() {
  return new AppError(404, "TICKET_NOT_FOUND", "Ticket not found");
}

// Handlers only describe the happy path. parseInput and ticketNotFound throw, and Express 5
// forwards the rejected promise to errorHandler.

// POST /api/tickets
ticketRouter.post("/", async (req, res) => {
  const input = parseInput(createTicketSchema, req.body, "body");
  const ticket = await createTicket(input);
  res.status(201).location(`/api/tickets/${ticket.id}`).json({ data: ticket });
});

// GET /api/tickets
ticketRouter.get("/", async (req, res) => {
  const query = parseInput(listTicketsQuerySchema, req.query, "query");
  const { tickets, nextCursor } = await listTickets(query);
  // nextCursor is null on the last page; clients pass it back as ?cursor= to get the next one.
  res.status(200).json({ data: tickets, page: { limit: query.limit, nextCursor } });
});

// GET /api/tickets/:id
ticketRouter.get("/:id", async (req, res) => {
  const { id } = parseInput(ticketIdParamsSchema, req.params, "params");
  const ticket = await getTicketById(id);
  if (!ticket) {
    throw ticketNotFound();
  }
  res.status(200).json({ data: ticket });
});

// PATCH /api/tickets/:id
ticketRouter.patch("/:id", async (req, res) => {
  const { id } = parseInput(ticketIdParamsSchema, req.params, "params");
  const changes = parseInput(updateTicketSchema, req.body, "body");
  const ticket = await updateTicket(id, changes);
  if (!ticket) {
    throw ticketNotFound();
  }
  res.status(200).json({ data: ticket });
});
