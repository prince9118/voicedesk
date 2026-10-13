import { Router } from "express";
import { getAuth, requireAuth } from "../auth/require-auth.js";
import { AppError } from "../errors.js";
import { startVoiceSession } from "./voice.service.js";

export const voiceRouter = Router();

voiceRouter.use(requireAuth);

// POST /api/voice/sessions: start a voice conversation. Returns everything the browser needs to
// connect to LiveKit directly; the API secret used to sign the token stays on this server.
// POST, not GET: each call creates a new room, and the response must not be cached.
voiceRouter.post("/sessions", async (req, res) => {
  const result = await startVoiceSession(getAuth(req).user);
  if (result.kind === "user_limit") {
    res.set("Retry-After", String(result.retryAfterSeconds));
    const hours = Math.ceil(result.retryAfterSeconds / 3600);
    throw new AppError(429, "VOICE_LIMIT_REACHED", `You have used today's calls. You can start another in about ${hours} hour(s).`);
  }
  if (result.kind === "capacity") {
    res.set("Retry-After", "3600");
    throw new AppError(429, "VOICE_CAPACITY_REACHED", "Voice calls are at capacity for today. Please try again later.");
  }
  res.set("Cache-Control", "no-store");
  res.status(201).json({ data: result.session });
});
