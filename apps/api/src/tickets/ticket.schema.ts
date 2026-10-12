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

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

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
