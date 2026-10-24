// Graceful shutdown with a deadline. On SIGINT/SIGTERM we stop accepting connections and let in-flight
// requests finish, then close the database pool so Postgres is not left with dangling connections.
// Without a deadline, one stuck request (or an idle keep-alive connection that never closes) would
// keep the process alive forever, and the platform would eventually kill it with SIGKILL, skipping the
// clean database disconnect. So after `timeoutMs` we close what is left and exit anyway.

export interface ClosableServer {
  close(callback: (err?: Error) => void): unknown;
  closeAllConnections(): void;
}

export interface ShutdownDeps {
  server: ClosableServer;
  disconnect: () => Promise<void>;
  exit: (code: number) => void;
  log: { info: (obj: object, msg: string) => void; warn: (obj: object, msg: string) => void; error: (obj: object, msg: string) => void };
  timeoutMs?: number;
}

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 10_000;

export function createShutdown({ server, disconnect, exit, log, timeoutMs = DEFAULT_SHUTDOWN_TIMEOUT_MS }: ShutdownDeps) {
  let started = false;

  return function shutdown(signal: string): void {
    // A second signal (impatient Ctrl+C, or the platform repeating SIGTERM) must not start a second shutdown.
    if (started) return;
    started = true;
    log.info({ signal, timeoutMs }, "Shutting down");

    // The deadline. unref(): this timer alone must never keep the process alive.
    const deadline = setTimeout(() => {
      log.warn({ timeoutMs }, "Shutdown deadline reached; closing remaining connections");
      server.closeAllConnections();
      void disconnect().finally(() => exit(1));
    }, timeoutMs);
    deadline.unref();

    server.close(async (err) => {
      clearTimeout(deadline);
      try {
        await disconnect();
      } catch (disconnectError) {
        log.error({ err: disconnectError }, "Could not close the database pool");
        exit(1);
        return;
      }
      if (err) log.error({ err }, "Server closed with an error");
      exit(err ? 1 : 0);
    });
  };
}
