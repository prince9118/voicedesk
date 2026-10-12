import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors.js";
import { type AuthUser, findSessionUser, hashToken } from "./session.js";

// Adds `req.auth` to Express's Request type (declaration merging). It is optional because only
// routes behind requireAuth have it; handlers read it through getAuth(), which narrows the type.
declare global {
  namespace Express {
    interface Request {
      auth?: { user: AuthUser; sessionTokenHash: string };
    }
  }
}

// Tokens we issue are 32 bytes in base64url: exactly 43 URL-safe characters.
// Anything else is rejected before it reaches the database.
const BEARER_TOKEN = /^Bearer ([A-Za-z0-9_-]{43})$/;

function unauthorized(res: Response): AppError {
  // RFC 6750: a 401 for a bearer-protected resource tells the client which scheme to use.
  res.set("WWW-Authenticate", 'Bearer realm="voicedesk"');
  return new AppError(401, "UNAUTHENTICATED", "Authentication required");
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const match = BEARER_TOKEN.exec(req.headers.authorization ?? "");
  const token = match?.[1];
  if (!token) {
    throw unauthorized(res);
  }

  const sessionTokenHash = hashToken(token);
  const user = await findSessionUser(sessionTokenHash);
  if (!user) {
    throw unauthorized(res);
  }

  req.auth = { user, sessionTokenHash };
  next();
}

// For handlers mounted after requireAuth. If auth is missing here, a route was wired without
// requireAuth: that is our bug, so it becomes a 500 rather than silently running unauthenticated.
export function getAuth(req: Request): { user: AuthUser; sessionTokenHash: string } {
  if (!req.auth) {
    throw new Error("getAuth() called on a route without requireAuth");
  }
  return req.auth;
}
