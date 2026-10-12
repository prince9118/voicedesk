import { z } from "zod";

// Position of the last ticket a client has seen. Sort order is (createdAt DESC, id DESC);
// id is the tiebreaker for tickets created in the same millisecond.
export interface TicketCursor {
  createdAt: Date;
  id: string;
}

const cursorPayloadSchema = z.strictObject({
  createdAt: z.iso.datetime(),
  id: z.uuid(),
});

// Opaque to clients: they pass it back unchanged and must not rely on its contents,
// which leaves us free to change the encoding later.
export function encodeCursor(cursor: TicketCursor): string {
  const payload = { createdAt: cursor.createdAt.toISOString(), id: cursor.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

// Query-string schema: turns the opaque string into a validated TicketCursor, or reports an issue.
// Cursors come from clients, so a tampered or truncated one must fail validation, not crash.
export const cursorSchema = z.string().transform((value, ctx): TicketCursor => {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    decoded = undefined;
  }

  const result = cursorPayloadSchema.safeParse(decoded);
  if (!result.success) {
    ctx.addIssue({ code: "custom", message: "Invalid cursor" });
    return z.NEVER;
  }
  return { createdAt: new Date(result.data.createdAt), id: result.data.id };
});
