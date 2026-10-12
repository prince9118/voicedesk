import { randomUUID } from "node:crypto";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { config } from "./config.js";

// Application logger. Production writes one JSON object per line to stdout, which log
// platforms ingest directly. Development pipes through pino-pretty for readability.
export const logger = pino({
  level: config.LOG_LEVEL,
  // Safety net: if any of these paths ever appear in a log object, the value is replaced.
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "*.customerEmail",
      "*.email",
      "*.password",
      "*.passwordHash",
      "*.token",
      "*.participantToken",
    ],
    censor: "[REDACTED]",
  },
  transport: config.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

// Accept a caller-supplied request id only if it is short and plain, so a client cannot
// inject newlines or huge values into our logs.
const SAFE_REQUEST_ID = /^[A-Za-z0-9._-]{1,64}$/;

// Logs one line per finished request and attaches req.log, a child logger carrying the request id.
export const httpLogger = pinoHttp({
  logger,
  // Platforms poll these every few seconds; logging each probe would drown real traffic.
  // A failing readiness check still logs its own warning.
  autoLogging: { ignore: (req) => req.url === "/health" || req.url === "/ready" },
  genReqId: (req, res) => {
    const incoming = req.headers["x-request-id"];
    const id = typeof incoming === "string" && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader("X-Request-Id", id);
    return id;
  },
  // 4xx is the client's problem (warn); 5xx is ours (error) and is what alerts should watch.
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return "error";
    if (res.statusCode >= 400) return "warn";
    return "info";
  },
  // Log only what is needed to debug. The defaults include all headers and the client IP.
  serializers: {
    req: (req: pino.SerializedRequest) => ({ id: req.id, method: req.method, url: req.url }),
    res: (res: pino.SerializedResponse) => ({ statusCode: res.statusCode }),
  },
});
