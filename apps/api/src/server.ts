import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { errorHandler, notFoundHandler } from "./error-handler.js";
import { httpLogger, logger } from "./logger.js";
import { ticketRouter } from "./tickets/ticket.routes.js";
const app = express();

// First, so every request (including ones rejected by express.json) gets an id and a log line.
app.use(httpLogger);
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
app.get("/ready", async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready", checks: { database: "up" } });
  } catch (err) {
    req.log.warn({ err }, "Readiness check failed");
    res.status(503).json({ status: "unavailable", checks: { database: "down" } });
  }
});

app.use("/api/tickets", ticketRouter);

// Order matters: 404 after all routes, error handler last.
app.use(notFoundHandler);
app.use(errorHandler);

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "VoiceDesk API listening");
});

// Graceful shutdown: stop accepting new requests, let in-flight ones finish,
// then close the database pool so Postgres is not left with dangling connections.
function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
