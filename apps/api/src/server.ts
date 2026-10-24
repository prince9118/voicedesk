import { app } from "./app.js";
import { config } from "./config.js";
import { prisma } from "./db.js";
import { logger } from "./logger.js";
import { startCleanupJob } from "./maintenance.js";
import { createShutdown } from "./shutdown.js";

// Process entry point: the only file that opens a port and handles OS signals.
const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, "VoiceDesk API listening");
});

// Housekeeping: expired sessions would otherwise pile up forever (see maintenance.ts).
const stopCleanup = startCleanupJob(logger);

const shutdown = createShutdown({
  server,
  disconnect: async () => {
    stopCleanup();
    await prisma.$disconnect();
  },
  exit: (code) => process.exit(code),
  log: logger,
});

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
