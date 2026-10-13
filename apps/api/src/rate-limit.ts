import type { NextFunction, Request, Response } from "express";
import { AppError } from "./errors.js";

// Fixed-window, per-IP request limiter kept in memory.
// Good enough for one API instance: counts reset on restart and are not shared between instances.
// With several instances, move the counters to Postgres or Redis so every instance sees them.

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  now?: () => number; // injectable clock for tests
}

export function rateLimit({ windowMs, max, now = Date.now }: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const time = now();
    // Bound memory: once the table is large, drop windows that have already expired.
    if (hits.size > 10_000) {
      for (const [key, entry] of hits) if (entry.resetAt <= time) hits.delete(key);
    }

    // req.ip is the visitor's address only if TRUST_PROXY is set correctly (see config.ts).
    const key = req.ip ?? "unknown";
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= time) {
      entry = { count: 0, resetAt: time + windowMs };
      hits.set(key, entry);
    }
    entry.count++;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.resetAt - time) / 1000);
      res.set("Retry-After", String(retryAfterSeconds));
      next(
        new AppError(429, "RATE_LIMITED", `Too many attempts. Try again in ${Math.ceil(retryAfterSeconds / 60)} minute(s).`),
      );
      return;
    }
    next();
  };
}
