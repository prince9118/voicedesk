import { randomUUID } from "node:crypto";
import type { CreateTicketInput, Ticket } from "./ticket.schema.js";

// Temporary in-memory storage. Lost on every restart; replaced by PostgreSQL in Milestone 2.
const tickets = new Map<string, Ticket>();

// These functions are async even though a Map is synchronous, so that swapping in
// Prisma later does not change the function signatures the routes depend on.
export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  const now = new Date();
  const ticket: Ticket = {
    id: randomUUID(),
    subject: input.subject,
    description: input.description,
    customerEmail: input.customerEmail,
    priority: input.priority,
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  tickets.set(ticket.id, ticket);
  return ticket;
}

export async function listTickets(): Promise<Ticket[]> {
  return Array.from(tickets.values());
}
