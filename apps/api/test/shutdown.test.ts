import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createShutdown } from "../src/shutdown.js";

// Fake servers and a fake clock: shutdown logic is about ordering and deadlines, not real sockets.

function setup(options: { closeCompletes: boolean; closeError?: Error; disconnect?: () => Promise<void> }) {
  const events: string[] = [];
  const server = {
    close: vi.fn((cb: (err?: Error) => void) => {
      events.push("close");
      if (options.closeCompletes) void Promise.resolve().then(() => cb(options.closeError));
    }),
    closeAllConnections: vi.fn(() => events.push("closeAllConnections")),
  };
  const disconnect = vi.fn(options.disconnect ?? (async () => void events.push("disconnect")));
  const exit = vi.fn((code: number) => void events.push(`exit(${code})`));
  const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  const shutdown = createShutdown({ server, disconnect, exit, log, timeoutMs: 5_000 });
  return { shutdown, server, disconnect, exit, log, events };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("graceful shutdown", () => {
  it("stops accepting connections, closes the database, then exits 0 once requests have drained", async () => {
    const { shutdown, events } = setup({ closeCompletes: true });

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toEqual(["close", "disconnect", "exit(0)"]);
  });

  it("exits 1 after the deadline when a request never finishes, closing leftover connections first", async () => {
    const { shutdown, events, exit } = setup({ closeCompletes: false });

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(4_999);
    expect(exit).not.toHaveBeenCalled(); // still waiting for the stuck request

    await vi.advanceTimersByTimeAsync(1);
    expect(events).toEqual(["close", "closeAllConnections", "disconnect", "exit(1)"]);
  });

  it("does not trigger the deadline when the server drained in time", async () => {
    const { shutdown, exit, server } = setup({ closeCompletes: true });

    shutdown("SIGINT");
    await vi.advanceTimersByTimeAsync(60_000);

    expect(exit).toHaveBeenCalledTimes(1);
    expect(server.closeAllConnections).not.toHaveBeenCalled();
  });

  it("ignores a second signal while shutting down", async () => {
    const { shutdown, server, exit } = setup({ closeCompletes: true });

    shutdown("SIGINT");
    shutdown("SIGINT");
    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("exits 1 if the server closes with an error, and still closes the database", async () => {
    const { shutdown, events, log } = setup({ closeCompletes: true, closeError: new Error("boom") });

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);

    expect(events).toEqual(["close", "disconnect", "exit(1)"]);
    expect(log.error).toHaveBeenCalled();
  });

  it("exits 1 and says why when the database pool cannot be closed", async () => {
    const { shutdown, exit, log } = setup({
      closeCompletes: true,
      disconnect: () => Promise.reject(new Error("pool stuck")),
    });

    shutdown("SIGTERM");
    await vi.advanceTimersByTimeAsync(0);

    expect(exit).toHaveBeenCalledWith(1);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ err: expect.any(Error) }), expect.any(String));
  });
});
