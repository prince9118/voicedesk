import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { config } from "./config.js";
import { isDatabaseUnavailableError, prisma } from "./db.js";
import { ticketRouter } from "./tickets/ticket.routes.js";
const app = express();

app.use(cors());
app.use(express.json());

// Liveness: is the process up? Deliberately does not touch the database, so a DB outage
// does not make a platform restart a perfectly healthy API process.
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "voicedesk",
    timestamp: new Date().toISOString()
  });
});

// Readiness: can this instance serve traffic right now? Used to stop routing requests
// to it while its dependencies are down.
app.get("/ready", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", checks: { database: "up" } });
  } catch (err) {
    console.error("Readiness check failed", err);
    res.status(503).json({ status: "unavailable", checks: { database: "down" } });
  }
});

app.use("/api/tickets", ticketRouter);

// Reached only when no route above matched.
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Route ${req.method} ${req.path} not found` },
  });
});

// Express recognises error-handling middleware by its four parameters.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // express.json() throws a SyntaxError tagged with type "entity.parse.failed" for malformed JSON.
  if (err instanceof SyntaxError && "type" in err && err.type === "entity.parse.failed") {
    res.status(400).json({
      error: { code: "INVALID_JSON", message: "Request body is not valid JSON" },
    });
    return;
  }

  // Infrastructure outage, not a bug: 503 + Retry-After tells clients a retry may succeed.
  if (isDatabaseUnavailableError(err)) {
    console.error("Database unavailable", err);
    res.status(503).set("Retry-After", "5").json({
      error: { code: "SERVICE_UNAVAILABLE", message: "Service temporarily unavailable, try again shortly" },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
});

const server = app.listen(config.PORT, () => {
  console.log(`Voice desk api running on port ${config.PORT}`);
});

// Graceful shutdown: stop accepting new requests, let in-flight ones finish,
// then close the database pool so Postgres is not left with dangling connections.
function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
