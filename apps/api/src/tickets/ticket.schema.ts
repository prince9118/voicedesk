import { z } from "zod";
import { textField } from "../validation.js";
import { cursorSchema } from "./ticket.cursor.js";

// `as const` keeps these as literal types ("open" | "in_progress" | ...) instead of string[].
export const TICKET_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "urgent"] as const;

export const ticketStatusSchema = z.enum(TICKET_STATUSES);
export const ticketPrioritySchema = z.enum(TICKET_PRIORITIES);

const subjectField = textField(3, 200);
const descriptionField = textField(1, 5000);

// What a client may send when creating a ticket. strictObject rejects unknown keys, so a client
// cannot smuggle in `id`, `status` or `userId`; the owner always comes from the session.
// priority has no Zod default: the database defaults it to "medium", and leaving it out of the
// parsed object lets ticket.policy.ts see whether the caller actually tried to set it.
export const createTicketSchema = z.strictObject({
  subject: subjectField,
  description: descriptionField,
  priority: ticketPrioritySchema.optional(),
});

// PATCH: every field optional, but at least one must be present. Who may set which field is
// decided in ticket.policy.ts, not here: this schema describes valid input, not permissions.
export const updateTicketSchema = z
  .strictObject({
    subject: subjectField.optional(),
    description: descriptionField.optional(),
    priority: ticketPrioritySchema.optional(),
    status: ticketStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
    // Only run this rule if everything else passed, so { "userId": "..." } reports
    // just the unrecognized key instead of two errors.
    when: (payload) => payload.issues.length === 0,
  });

// GET list filters and pagination. Strict so a typo like ?stauts=open is a 400, not a silent "return everything".
export const listTicketsQuerySchema = z.strictObject({
  status: ticketStatusSchema.optional(),
  priority: ticketPrioritySchema.optional(),
  // Query values are strings; coerce "20" to 20. The upper bound stops ?limit=1000000.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: cursorSchema.optional(),
});

// Route params arrive as strings; validate the shape before touching storage.
export const ticketIdParamsSchema = z.object({
  id: z.uuid(),
});

// Ticket numbers are Postgres INTEGER (int4). Without the upper bound, /number/99999999999 would pass
// validation and then fail inside Prisma as a 500.
export const ticketNumberParamsSchema = z.object({
  number: z.coerce.number().int().min(1).max(2_147_483_647),
});

export type TicketStatus = z.infer<typeof ticketStatusSchema>;
export type TicketPriority = z.infer<typeof ticketPrioritySchema>;
export type CreateTicketInput = z.infer<typeof createTicketSchema>;
export type UpdateTicketInput = z.infer<typeof updateTicketSchema>;
export type ListTicketsQuery = z.infer<typeof listTicketsQuerySchema>;

// The full ticket as the server stores it. Server-owned fields (id, owner, status, timestamps)
// are not part of CreateTicketInput.
export interface Ticket {
  id: string;
  number: number;
  subject: string;
  description: string;
  userId: string;
  priority: TicketPriority;
  status: TicketStatus;
  createdAt: Date;
  updatedAt: Date;
}
