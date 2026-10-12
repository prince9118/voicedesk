import type { AuthUser } from "../auth/session.js";
import { AppError } from "../errors.js";

// Authorization rules for tickets, in one place so they can be read, reviewed and tested together.
//
//                 customer                         agent (support staff)
//   see           own tickets only                 all tickets
//   create        subject, description             + priority
//   update        subject, description (own)       any field, any ticket

// Row-level rule: merged into the WHERE clause of every ticket query. The store requires it as an
// argument, so a new query cannot "forget" ownership the way an after-the-fact `if` can.
export interface TicketScope {
  userId?: string;
}

export function ticketScope(user: AuthUser): TicketScope {
  return user.role === "agent" ? {} : { userId: user.id };
}

// Field-level rule: owning a ticket does not mean you may triage it. Without this, every customer
// could mark their own ticket "urgent" or "resolved".
const CUSTOMER_WRITABLE_FIELDS = new Set(["subject", "description"]);

export function assertCanWriteFields(user: AuthUser, input: object): void {
  if (user.role === "agent") {
    return;
  }
  const forbidden = Object.keys(input).filter((field) => !CUSTOMER_WRITABLE_FIELDS.has(field));
  if (forbidden.length > 0) {
    // 403, not 404: the caller may see this ticket, they just may not change these fields.
    throw new AppError(403, "FORBIDDEN", "You are not allowed to set these fields", { fields: forbidden });
  }
}
