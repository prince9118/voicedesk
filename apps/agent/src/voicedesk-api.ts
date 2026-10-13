import { createHash } from "node:crypto";
import { z } from "zod";

// HTTP client the agent's tools use to reach the VoiceDesk API. It knows nothing about
// authorization: it presents the agent key and the room name, and the API decides which customer
// that is and what they may see. Deliberately free of config/env imports so tests can construct it.

// A caller is waiting on the line: fail fast rather than leave silence.
const REQUEST_TIMEOUT_MS = 4_000;
const RETRY_DELAY_MS = 300;

const ticketSchema = z.object({
  number: z.number(),
  subject: z.string(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type TicketSummary = z.infer<typeof ticketSchema>;

// Outcomes a tool needs to tell apart. Failures are values, not exceptions, so each tool decides
// what to say to the caller for each case.
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "not_found" | "unavailable" | "rejected" };

export interface VoiceDeskApiOptions {
  baseUrl: string;
  agentKey: string;
  roomName: string;
  fetch?: typeof fetch; // injectable for tests
  timeoutMs?: number; // per attempt; injectable for tests
}

export class VoiceDeskApi {
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly options: VoiceDeskApiOptions) {
    this.fetchImpl = options.fetch ?? fetch;
    this.timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  }

  async getTicketByNumber(number: number, signal: AbortSignal): Promise<ApiResult<TicketSummary>> {
    return this.send({ method: "GET", path: `/api/tickets/number/${number}` }, z.object({ data: ticketSchema }), signal, (body) => body.data);
  }

  async listRecentTickets(signal: AbortSignal): Promise<ApiResult<TicketSummary[]>> {
    return this.send({ method: "GET", path: "/api/tickets?limit=5" }, z.object({ data: z.array(ticketSchema) }), signal, (body) => body.data);
  }

  // One ticket per issue per call. Derived from the room and the normalized subject, not the tool
  // call id: if the LLM calls create_ticket twice for the same issue (it does this), both calls get
  // the same key and the second returns the first ticket. SHA-256 hex = 64 chars, the API's limit.
  idempotencyKeyFor(subject: string): string {
    const normalized = subject.trim().toLowerCase().replace(/\s+/g, " ");
    return createHash("sha256").update(`${this.options.roomName}|${normalized}`).digest("hex");
  }

  // Safe to retry only because of the idempotency key: if the first attempt reached the API but its
  // response was lost (timeout), the retry returns that same ticket instead of creating a second one.
  async createTicket(
    input: { subject: string; description: string },
    idempotencyKey: string,
    signal: AbortSignal,
  ): Promise<ApiResult<{ ticket: TicketSummary; replayed: boolean }>> {
    return this.send(
      { method: "POST", path: "/api/tickets", body: input, idempotencyKey },
      z.object({ data: ticketSchema }),
      signal,
      (body, response) => ({ ticket: body.data, replayed: response.headers.get("Idempotent-Replayed") === "true" }),
    );
  }

  // One retry, only for failures that a second attempt can plausibly fix (network error, timeout,
  // 503), and never after the caller interrupted (signal aborted): then the answer is no longer wanted.
  // Only idempotent requests may be retried: GETs, and POSTs that carry an Idempotency-Key.
  private async send<S extends z.ZodType, T>(
    request: RequestSpec,
    schema: S,
    signal: AbortSignal,
    pick: (body: z.output<S>, response: Response) => T,
  ): Promise<ApiResult<T>> {
    const retryable = request.method === "GET" || request.idempotencyKey !== undefined;
    for (let attempt = 1; attempt <= 2; attempt++) {
      const outcome = await this.attempt(request, schema, signal);
      if (outcome.kind === "ok") {
        return { ok: true, data: pick(outcome.body, outcome.response) };
      }
      if (outcome.kind === "final") {
        return { ok: false, reason: outcome.reason };
      }
      if (!retryable || signal.aborted || attempt === 2) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
    if (signal.aborted) {
      // Let the framework see the cancellation instead of reporting a fake "unavailable".
      throw signal.reason;
    }
    return { ok: false, reason: "unavailable" };
  }

  private async attempt<S extends z.ZodType>(
    request: RequestSpec,
    schema: S,
    signal: AbortSignal,
  ): Promise<
    | { kind: "ok"; body: z.output<S>; response: Response }
    | { kind: "final"; reason: "not_found" | "rejected" | "unavailable" }
    | { kind: "retryable" }
  > {
    const headers: Record<string, string> = {
      Authorization: `Agent ${this.options.agentKey}`,
      "X-Voice-Room": this.options.roomName,
    };
    if (request.body !== undefined) headers["Content-Type"] = "application/json";
    if (request.idempotencyKey !== undefined) headers["Idempotency-Key"] = request.idempotencyKey;

    let response: Response;
    try {
      response = await this.fetchImpl(new URL(request.path, this.options.baseUrl), {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        // Abort on whichever comes first: the caller interrupting, or our timeout.
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
      });
    } catch {
      return { kind: "retryable" }; // network error, timeout, or caller abort (checked by send())
    }

    if (response.status === 404) return { kind: "final", reason: "not_found" };
    if (response.status === 503) return { kind: "retryable" };
    // 400/401/403/422 mean our request or credentials are wrong; retrying will not help.
    if (response.status >= 400 && response.status < 500) return { kind: "final", reason: "rejected" };
    if (!response.ok) return { kind: "final", reason: "unavailable" };

    // Validate instead of trusting: a contract mismatch should be a clear failure here, not
    // garbage handed to the LLM.
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", body: parsed.data, response } : { kind: "final", reason: "unavailable" };
  }
}

interface RequestSpec {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
}
