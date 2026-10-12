import { Router } from "express";
import { z } from "zod";
import {
  createTicketSchema,
  listTicketsQuerySchema,
  ticketIdParamsSchema,
  updateTicketSchema,
} from "./ticket.schema.js";
import { createTicket, getTicketById, listTickets, updateTicket } from "./ticket.store.js";

export const ticketRouter = Router();

// POST /api/tickets
ticketRouter.post("/", async (req, res) => {
  // safeParse never throws; it returns either { success: true, data } or { success: false, error }.
  const result = createTicketSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body is invalid",
        details: z.flattenError(result.error),
      },
    });
    return;
  }

  // After the check above, TypeScript has narrowed result.data to CreateTicketInput.
  const ticket = await createTicket(result.data);
  res.status(201).location(`/api/tickets/${ticket.id}`).json({ data: ticket });
});

// GET /api/tickets
ticketRouter.get("/", async (req, res) => {
  const query = listTicketsQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Query parameters are invalid",
        details: z.flattenError(query.error),
      },
    });
    return;
  }

  const tickets = await listTickets(query.data);
  res.status(200).json({ data: tickets });
});

// GET /api/tickets/:id
ticketRouter.get("/:id", async (req, res) => {
  const params = ticketIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      error: { code: "INVALID_TICKET_ID", message: "Ticket id must be a UUID" },
    });
    return;
  }

  const ticket = await getTicketById(params.data.id);
  if (!ticket) {
    res.status(404).json({
      error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
    });
    return;
  }

  // Narrowed from Ticket | undefined to Ticket by the check above.
  res.status(200).json({ data: ticket });
});

// PATCH /api/tickets/:id
ticketRouter.patch("/:id", async (req, res) => {
  const params = ticketIdParamsSchema.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({
      error: { code: "INVALID_TICKET_ID", message: "Ticket id must be a UUID" },
    });
    return;
  }

  const body = updateTicketSchema.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request body is invalid",
        details: z.flattenError(body.error),
      },
    });
    return;
  }

  const ticket = await updateTicket(params.data.id, body.data);
  if (!ticket) {
    res.status(404).json({
      error: { code: "TICKET_NOT_FOUND", message: "Ticket not found" },
    });
    return;
  }

  res.status(200).json({ data: ticket });
});
