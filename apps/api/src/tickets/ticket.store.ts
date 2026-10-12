import { randomUUID } from "node:crypto";
import type { CreateTicketInput, Ticket, UpdateTicketInput } from "./ticket.schema.js";

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

// Returns undefined rather than throwing: "not found" is an expected outcome, not an error.
export async function getTicketById(id: string): Promise<Ticket | undefined> {
  return tickets.get(id);
}

export async function updateTicket(
  id: string,
  changes: UpdateTicketInput,
): Promise<Ticket | undefined> {
  const existing = tickets.get(id);
  if (!existing) {
    return undefined;
  }

  // Build a new object instead of mutating `existing`, and only take fields that were sent.
  const updated: Ticket = {
    ...existing,
    subject: changes.subject ?? existing.subject,
    description: changes.description ?? existing.description,
    priority: changes.priority ?? existing.priority,
    status: changes.status ?? existing.status,
    updatedAt: new Date(),
  };
  tickets.set(id, updated);
  return updated;
}
