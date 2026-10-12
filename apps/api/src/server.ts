import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { prisma } from "./db.js";
import { ticketRouter } from "./tickets/ticket.routes.js";
const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "voicedesk",
    timestamp: new Date().toISOString()
  });
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

  console.error(err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Something went wrong" },
  });
});

const server = app.listen(PORT, () => {
  console.log(`Voice desk api running on port ${PORT}`);
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
