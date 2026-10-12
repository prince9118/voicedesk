import { prisma } from "../db.js";
import { Prisma } from "../generated/prisma/client.js";
import type {
  CreateTicketInput,
  ListTicketsFilters,
  Ticket,
  UpdateTicketInput,
} from "./ticket.schema.js";

// Same signatures as the in-memory version, so the routes did not change.
// Return types are our own Ticket interface: if the Prisma model drifts from it, this file stops compiling.

export async function createTicket(input: CreateTicketInput): Promise<Ticket> {
  // id, status, createdAt and updatedAt are filled in by schema defaults.
  return prisma.ticket.create({
    data: {
      subject: input.subject,
      description: input.description,
      customerEmail: input.customerEmail,
      priority: input.priority,
    },
  });
}

export async function listTickets(filters: ListTicketsFilters): Promise<Ticket[]> {
  // Prisma ignores `undefined` in `where`, so a filter that was not provided matches everything.
  return prisma.ticket.findMany({
    where: { status: filters.status, priority: filters.priority },
    orderBy: { createdAt: "desc" },
  });
}

// Returns undefined rather than throwing: "not found" is an expected outcome, not an error.
export async function getTicketById(id: string): Promise<Ticket | undefined> {
  const ticket = await prisma.ticket.findUnique({ where: { id } });
  return ticket ?? undefined;
}

export async function updateTicket(
  id: string,
  changes: UpdateTicketInput,
): Promise<Ticket | undefined> {
  try {
    // A single UPDATE ... WHERE id = $1: no read-then-write race.
    // Fields left undefined are not touched; @updatedAt is set automatically.
    return await prisma.ticket.update({
      where: { id },
      data: {
        subject: changes.subject,
        description: changes.description,
        priority: changes.priority,
        status: changes.status,
      },
    });
  } catch (err) {
    // P2025: the record to update does not exist.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return undefined;
    }
    throw err;
  }
}
