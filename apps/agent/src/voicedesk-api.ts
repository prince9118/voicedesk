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
    return this.get(`/api/tickets/number/${number}`, z.object({ data: ticketSchema }), signal, (body) => body.data);
  }

  async listRecentTickets(signal: AbortSignal): Promise<ApiResult<TicketSummary[]>> {
    return this.get("/api/tickets?limit=5", z.object({ data: z.array(ticketSchema) }), signal, (body) => body.data);
  }

  // GETs are safe to retry: repeating a read changes nothing. One retry, only for failures that a
  // second attempt can plausibly fix (network error, timeout, 503), and never after the caller
  // interrupted (signal aborted): then the answer is no longer wanted.
  private async get<S extends z.ZodType, T>(
    path: string,
    schema: S,
    signal: AbortSignal,
    pick: (body: z.output<S>) => T,
  ): Promise<ApiResult<T>> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      const outcome = await this.attempt(path, schema, signal);
      if (outcome.kind === "ok") {
        return { ok: true, data: pick(outcome.body) };
      }
      if (outcome.kind === "final") {
        return { ok: false, reason: outcome.reason };
      }
      if (signal.aborted || attempt === 2) {
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
    path: string,
    schema: S,
    signal: AbortSignal,
  ): Promise<
    | { kind: "ok"; body: z.output<S> }
    | { kind: "final"; reason: "not_found" | "rejected" | "unavailable" }
    | { kind: "retryable" }
  > {
    let response: Response;
    try {
      response = await this.fetchImpl(new URL(path, this.options.baseUrl), {
        headers: {
          Authorization: `Agent ${this.options.agentKey}`,
          "X-Voice-Room": this.options.roomName,
        },
        // Abort on whichever comes first: the caller interrupting, or our timeout.
        signal: AbortSignal.any([signal, AbortSignal.timeout(this.timeoutMs)]),
      });
    } catch {
      return { kind: "retryable" }; // network error, timeout, or caller abort (checked by get())
    }

    if (response.status === 404) return { kind: "final", reason: "not_found" };
    if (response.status === 503) return { kind: "retryable" };
    // 401/403/400 mean our request or credentials are wrong; retrying will not help.
    if (response.status >= 400 && response.status < 500) return { kind: "final", reason: "rejected" };
    if (!response.ok) return { kind: "final", reason: "unavailable" };

    // Validate instead of trusting: a contract mismatch should be a clear failure here, not
    // garbage handed to the LLM.
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    return parsed.success ? { kind: "ok", body: parsed.data } : { kind: "final", reason: "unavailable" };
  }
}
