import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, sessionStore, setUnauthorizedHandler } from "./client";

// The client is the only code that talks to the API. These tests fake `fetch` and check the contract
// the rest of the app relies on: tokens, error shapes, and what happens on 401.

const user = { id: "u1", email: "asha@example.com", name: "Asha", role: "customer" };
const ticket = {
  id: "t1",
  number: 1042,
  subject: "Cannot log in",
  description: "Reset email never arrives",
  status: "open",
  priority: "medium",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-01T09:00:00.000Z",
};

function respond(status: number, body?: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const fetchMock = vi.fn<typeof fetch>();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  setUnauthorizedHandler(() => {});
});
afterEach(() => vi.unstubAllGlobals());

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) ?? [];
  return { url: String(url), init: init ?? {}, headers: (init?.headers ?? {}) as Record<string, string> };
}

describe("sessionStore", () => {
  it("keeps the token for this tab only (sessionStorage), and clears it", () => {
    sessionStore.set("abc");
    expect(sessionStorage.getItem("voicedesk.session")).toBe("abc");
    expect(sessionStore.get()).toBe("abc");
    sessionStore.clear();
    expect(sessionStore.get()).toBeNull();
  });
});

describe("login and register", () => {
  it("sends credentials as JSON without an Authorization header, then stores the token", async () => {
    sessionStore.set("old-token"); // a stale token must not be sent to the login endpoint
    fetchMock.mockResolvedValue(respond(200, { data: { user, token: "new-token" } }));

    const result = await api.login("asha@example.com", "correct horse battery");

    const { url, init, headers } = lastRequest();
    expect(url).toBe("/api/auth/login");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ email: "asha@example.com", password: "correct horse battery" });
    expect(headers.Authorization).toBeUndefined();
    expect(sessionStore.get()).toBe("new-token");
    expect(result).toEqual(user);
  });

  it("registers with name, email and password", async () => {
    fetchMock.mockResolvedValue(respond(201, { data: { user, token: "t" } }));

    await api.register("Asha", "asha@example.com", "a-long-password");

    expect(JSON.parse(String(lastRequest().init.body))).toEqual({ name: "Asha", email: "asha@example.com", password: "a-long-password" });
  });
});

describe("errors", () => {
  it("turns the API's error body into an ApiError with its code, message and status", async () => {
    fetchMock.mockResolvedValue(respond(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }));

    const error = await api.login("a@b.co", "wrong-password-1").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS", message: "Invalid email or password" });
  });

  it("does not treat a wrong password as an expired session (no sign-out handler call)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    fetchMock.mockResolvedValue(respond(401, { error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password" } }));

    await api.login("a@b.co", "wrong-password-1").catch(() => {});

    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it("signs the user out when an authenticated request gets a 401 (expired or revoked session)", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    sessionStore.set("expired-token");
    fetchMock.mockResolvedValue(respond(401, { error: { code: "UNAUTHENTICATED", message: "Authentication required" } }));

    await expect(api.listTickets()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });

    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("gives a plain-language message when the server cannot be reached", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await api.listTickets().catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 0, code: "NETWORK" });
    expect((error as Error).message).toMatch(/can't reach voicedesk/i);
  });

  it("falls back to a generic message when an error response is not in our format", async () => {
    fetchMock.mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 }));

    const error = await api.listTickets().catch((e: unknown) => e);

    expect(error).toMatchObject({ status: 502, code: "UNKNOWN" });
    expect((error as Error).message).toMatch(/something went wrong/i);
  });

  it("rejects a successful response that does not match the expected shape", async () => {
    fetchMock.mockResolvedValue(respond(200, { data: [{ id: 1, subject: 42 }] }));

    await expect(api.listTickets()).rejects.toThrow();
  });
});

describe("tickets", () => {
  it("sends the session token as a Bearer header", async () => {
    sessionStore.set("my-token");
    fetchMock.mockResolvedValue(respond(200, { data: [ticket] }));

    const tickets = await api.listTickets();

    expect(lastRequest().url).toBe("/api/tickets?limit=50");
    expect(lastRequest().headers.Authorization).toBe("Bearer my-token");
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ number: 1042, status: "open" });
  });

  it("creates a ticket with just a subject and description", async () => {
    sessionStore.set("my-token");
    fetchMock.mockResolvedValue(respond(201, { data: ticket }));

    await api.createTicket("Cannot log in", "Reset email never arrives");

    expect(JSON.parse(String(lastRequest().init.body))).toEqual({ subject: "Cannot log in", description: "Reset email never arrives" });
  });

  it("starts a voice session and returns what the browser needs to connect", async () => {
    sessionStore.set("my-token");
    fetchMock.mockResolvedValue(respond(201, { data: { serverUrl: "wss://x.livekit.cloud", roomName: "support-1", participantToken: "jwt" } }));

    const session = await api.startVoiceSession();

    expect(lastRequest().init.method).toBe("POST");
    expect(session).toEqual({ serverUrl: "wss://x.livekit.cloud", roomName: "support-1", participantToken: "jwt" });
  });
});

describe("logout", () => {
  it("clears the token locally even if the server call fails", async () => {
    sessionStore.set("my-token");
    fetchMock.mockRejectedValue(new TypeError("offline"));

    await api.logout().catch(() => {});

    expect(sessionStore.get()).toBeNull();
  });
});
