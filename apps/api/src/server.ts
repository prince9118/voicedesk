import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";

// Process entry point: the only file that opens a port and handles OS signals.
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
