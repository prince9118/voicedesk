import { Router } from "express";
import { z } from "zod";
import { createTicketSchema } from "./ticket.schema.js";
import { createTicket, listTickets } from "./ticket.store.js";

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
ticketRouter.get("/", async (_req, res) => {
  const tickets = await listTickets();
  res.status(200).json({ data: tickets });
});
