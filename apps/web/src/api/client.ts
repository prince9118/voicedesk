import { z } from "zod";

// Thin, typed wrapper around the VoiceDesk API. Every response is validated with Zod, so components
// receive data with real types instead of trusting res.json() (which is `any`).

const SESSION_KEY = "voicedesk.session";

// sessionStorage: survives reloads in this tab, gone when the tab closes. Readable by any script on
// the page (as is localStorage), so XSS must be prevented: React escapes output and we never render
// raw HTML. An httpOnly cookie would hide it from scripts but needs CSRF protection.
export const sessionStore = {
  get: (): string | null => sessionStorage.getItem(SESSION_KEY),
  set: (token: string) => sessionStorage.setItem(SESSION_KEY, token),
  clear: () => sessionStorage.removeItem(SESSION_KEY),
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const errorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

// Lets the app react to an expired or revoked session from anywhere (e.g. send the user to login).
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

async function request<S extends z.ZodType>(
  path: string,
  schema: S,
  init: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<z.output<S>> {
  const headers: Record<string, string> = {};
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  const token = sessionStore.get();
  if (init.auth !== false && token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(path, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach VoiceDesk. Check your connection and try again.");
  }

  if (response.status === 204) return schema.parse(undefined);
  const body: unknown = await response.json().catch(() => undefined);

  if (!response.ok) {
    if (response.status === 401 && init.auth !== false) onUnauthorized();
    const parsed = errorBodySchema.safeParse(body);
    throw new ApiError(
      response.status,
      parsed.success ? parsed.data.error.code : "UNKNOWN",
      parsed.success ? parsed.data.error.message : "Something went wrong. Please try again.",
    );
  }
  return schema.parse(body);
}

// ---- Contracts (mirror the API's response shapes) ----

const userSchema = z.object({ id: z.string(), email: z.string(), name: z.string(), role: z.enum(["customer", "agent"]) });
export type User = z.infer<typeof userSchema>;

const authSchema = z.object({ data: z.object({ user: userSchema, token: z.string() }) });

export const ticketStatuses = ["open", "in_progress", "resolved", "closed"] as const;
const ticketSchema = z.object({
  id: z.string(),
  number: z.number(),
  subject: z.string(),
  description: z.string(),
  status: z.enum(ticketStatuses),
  priority: z.enum(["low", "medium", "high", "urgent"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Ticket = z.infer<typeof ticketSchema>;

const voiceSessionSchema = z.object({
  data: z.object({ serverUrl: z.string(), roomName: z.string(), participantToken: z.string() }),
});
export type VoiceSession = z.infer<typeof voiceSessionSchema>["data"];

// ---- Endpoints ----

export const api = {
  async login(email: string, password: string) {
    const { data } = await request("/api/auth/login", authSchema, { method: "POST", body: { email, password }, auth: false });
    sessionStore.set(data.token);
    return data.user;
  },
  async register(name: string, email: string, password: string) {
    const { data } = await request("/api/auth/register", authSchema, {
      method: "POST",
      body: { name, email, password },
      auth: false,
    });
    sessionStore.set(data.token);
    return data.user;
  },
  async me() {
    return (await request("/api/auth/me", z.object({ data: userSchema }))).data;
  },
  async logout() {
    try {
      await request("/api/auth/logout", z.undefined(), { method: "POST" });
    } finally {
      sessionStore.clear(); // log out locally even if the server call fails
    }
  },
  async listTickets() {
    return (await request("/api/tickets?limit=50", z.object({ data: z.array(ticketSchema) }))).data;
  },
  async createTicket(subject: string, description: string) {
    return (await request("/api/tickets", z.object({ data: ticketSchema }), { method: "POST", body: { subject, description } })).data;
  },
  async startVoiceSession() {
    return (await request("/api/voice/sessions", voiceSessionSchema, { method: "POST" })).data;
  },
};
