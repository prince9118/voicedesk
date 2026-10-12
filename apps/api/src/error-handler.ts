import type { NextFunction, Request, Response } from "express";
import { isDatabaseUnavailableError } from "./db.js";
import { AppError } from "./errors.js";

// The single place that decides what an error response looks like.
function sendError(res: Response, status: number, code: string, message: string, details?: unknown) {
  // `details` is omitted from the JSON when undefined.
  res.status(status).json({ error: { code, message, details } });
}

// Attach the real error to the response. pino-http then logs ONE line for the request
// (status, duration, request id and this error) instead of us logging a second line.
function attachErrorForLogging(res: Response, err: unknown) {
  res.err = err instanceof Error ? err : new Error(String(err));
}

// Reached only when no route matched.
export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(new AppError(404, "NOT_FOUND", `Route ${req.method} ${req.path} not found`));
}

// Express recognises error-handling middleware by its four parameters.
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // If the response already started streaming we cannot send a new status or body.
  // Delegating to Express's default handler makes it close the connection.
  if (res.headersSent) {
    req.log.error({ err }, "Error after response headers were sent");
    next(err);
    return;
  }

  if (err instanceof AppError) {
    sendError(res, err.status, err.code, err.message, err.details);
    return;
  }

  // express.json() throws a SyntaxError tagged with type "entity.parse.failed" for malformed JSON.
  if (err instanceof SyntaxError && "type" in err && err.type === "entity.parse.failed") {
    sendError(res, 400, "INVALID_JSON", "Request body is not valid JSON");
    return;
  }

  // Infrastructure outage, not a bug: 503 + Retry-After tells clients a retry may succeed.
  if (isDatabaseUnavailableError(err)) {
    attachErrorForLogging(res, err);
    res.set("Retry-After", "5");
    sendError(res, 503, "SERVICE_UNAVAILABLE", "Service temporarily unavailable, try again shortly");
    return;
  }

  // Unexpected: log everything (stack included, tagged with the request id), reveal nothing.
  attachErrorForLogging(res, err);
  sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
}
