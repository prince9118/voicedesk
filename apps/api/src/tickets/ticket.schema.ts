import { z } from "zod";

// `as const` keeps these as literal types ("open" | "in_progress" | ...) instead of string[].
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

// What a client is allowed to send when creating a ticket.
// strictObject rejects unknown keys, so a client cannot smuggle in `id` or `status`.
export const createTicketSchema = z.strictObject({
  subject: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(5000),
  customerEmail: z.email(),
  priority: ticketPrioritySchema.default("medium"),
});

// PATCH: every field optional, but at least one must be present.
// customerEmail is deliberately excluded: it identifies who owns the ticket.
export const updateTicketSchema = z
  .strictObject({
    subject: z.string().trim().min(3).max(200).optional(),
    description: z.string().trim().min(1).max(5000).optional(),
    priority: ticketPrioritySchema.optional(),
    status: ticketStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// GET list filters. Strict so a typo like ?stauts=open is a 400, not a silent "return everything".
export const listTicketsQuerySchema = z.strictObject({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
});

// Route params arrive as strings; validate the shape before touching storage.
export const ticketIdParamsSchema = z.object({
  id: z.uuid(),
});

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ListTicketsFilters = z.infer<typeof listTicketsQuerySchema>;

// The full ticket as the server stores it. Server-owned fields (id, status, timestamps)
// are not part of CreateTicketInput.
export interface Ticket {
  id: string;
  subject: string;
  description: string;
  customerEmail: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
}
