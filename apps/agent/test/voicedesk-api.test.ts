import { describe, expect, it, vi } from "vitest";
import { VoiceDeskApi } from "../src/voicedesk-api.js";

// The client is where every failure of the outside world is decided: timeouts, retries, cancellation,
// and malformed responses. A fake fetch lets us produce each case deterministically.

const ticket = {
  id: "8f0a6c1e-1111-4222-8333-444455556666",
  number: 1042,
  subject: "Cannot log in",
  status: "in_progress",
  priority: "high",
  userId: "u",
  description: "d",
  createdAt: "2026-10-01T09:00:00.000Z",
  updatedAt: "2026-10-02T09:00:00.000Z",
};

const ROOM = "support-8f0a6c1e-1111-4222-8333-444455556666";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function clientWith(fetchImpl: typeof fetch) {
  return new VoiceDeskApi({ baseUrl: "http://api.test", agentKey: "k".repeat(43), roomName: ROOM, fetch: fetchImpl });
}

const noAbort = () => new AbortController().signal;

describe("VoiceDeskApi", () => {
  it("authenticates as the agent for this room and returns a validated ticket", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(200, { data: ticket }));
    const result = await clientWith(fetchMock).getTicketByNumber(1042, noAbort());

    expect(result).toEqual({ ok: true, data: expect.objectContaining({ number: 1042, status: "in_progress" }) });
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://api.test/api/tickets/number/1042");
    expect(init?.headers).toEqual({ Authorization: `Agent ${"k".repeat(43)}`, "X-Voice-Room": ROOM });
  });

  it("maps 404 to not_found without retrying (it will not change)", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(404, { error: { code: "TICKET_NOT_FOUND" } }));
    expect(await clientWith(fetchMock).getTicketByNumber(1, noAbort())).toEqual({ ok: false, reason: "not_found" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries a 503 once, and succeeds if the second attempt does", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { data: ticket }));
    const result = await clientWith(fetchMock).getTicketByNumber(1042, noAbort());

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after one retry (bounded) and reports unavailable", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed"));
    expect(await clientWith(fetchMock).getTicketByNumber(1042, noAbort())).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry 401/403: the credentials are wrong, not the network", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(401, {}));
    expect(await clientWith(fetchMock).getTicketByNumber(1042, noAbort())).toEqual({ ok: false, reason: "rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a response that does not match the contract as unavailable, never passing it to the LLM", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(200, { data: { ...ticket, status: "pwned" } }));
    expect(await clientWith(fetchMock).getTicketByNumber(1042, noAbort())).toEqual({ ok: false, reason: "unavailable" });
  });

  it("stops immediately when the caller interrupts, without retrying", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      controller.abort(new Error("user interrupted"));
      throw init?.signal?.reason ?? new Error("aborted");
    });

    await expect(clientWith(fetchMock).getTicketByNumber(1042, controller.signal)).rejects.toThrow("user interrupted");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("URL-encodes help-center queries, so '&' or '?' in speech cannot add or break parameters", async () => {
    const passage = { source: { slug: "refunds", title: "Refunds" }, heading: "H", content: "C", score: 0.8 };
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(200, { data: [passage] }));

    const result = await clientWith(fetchMock).searchHelpCenter("refund & limit=99 ?x", noAbort());

    expect(result).toEqual({ ok: true, data: [{ source: passage.source, heading: "H", content: "C" }] });
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("refund & limit=99 ?x");
    expect(url.searchParams.get("limit")).toBe("3");
  });

  describe("createTicket", () => {
    const input = { subject: "Refund not received", description: "Ordered last week" };

    it("retries a lost response with the SAME idempotency key, so the API can replay instead of duplicating", async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError("fetch failed")) // e.g. timed out after the API committed
        .mockResolvedValueOnce(json(200, { data: ticket }));
      const client = clientWith(fetchMock);
      const key = client.idempotencyKeyFor(input.subject);

      const result = await client.createTicket(input, key, noAbort());

      expect(result.ok).toBe(true);
      const keys = fetchMock.mock.calls.map(([, init]) => new Headers(init?.headers).get("Idempotency-Key"));
      expect(keys).toEqual([key, key]);
      expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("POST");
    });

    it("reports replayed when the API says it returned an existing ticket", async () => {
      const replay = new Response(JSON.stringify({ data: ticket }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true" },
      });
      const result = await clientWith(vi.fn<typeof fetch>().mockResolvedValue(replay)).createTicket(input, "k", noAbort());
      expect(result).toEqual({ ok: true, data: { ticket: expect.objectContaining({ number: 1042 }), replayed: true } });
    });

    it("does not retry a 422 (key reused for different content): that is a bug, not a blip", async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json(422, {}));
      expect(await clientWith(fetchMock).createTicket(input, "k", noAbort())).toEqual({ ok: false, reason: "rejected" });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("derives one key per issue per call: same subject (any case/spacing) same key; other room or subject differs", () => {
      const a = clientWith(vi.fn<typeof fetch>());
      const otherRoom = new VoiceDeskApi({ baseUrl: "http://api.test", agentKey: "k".repeat(43), roomName: `${ROOM}-2` });

      expect(a.idempotencyKeyFor("Refund not received")).toBe(a.idempotencyKeyFor("  refund   NOT received "));
      expect(a.idempotencyKeyFor("Refund not received")).not.toBe(a.idempotencyKeyFor("Login broken"));
      expect(a.idempotencyKeyFor("Refund not received")).not.toBe(otherRoom.idempotencyKeyFor("Refund not received"));
      expect(a.idempotencyKeyFor("x")).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  it("aborts a hung request after its timeout, retries once, then reports unavailable", async () => {
    // A fetch that never answers on its own: it only settles when its signal aborts.
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
        }),
    );
    const client = new VoiceDeskApi({
      baseUrl: "http://api.test",
      agentKey: "k".repeat(43),
      roomName: ROOM,
      fetch: fetchMock,
      timeoutMs: 50,
    });

    const started = Date.now();
    expect(await client.getTicketByNumber(1042, noAbort())).toEqual({ ok: false, reason: "unavailable" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Two 50 ms attempts plus the 300 ms retry delay: bounded, not hanging.
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
