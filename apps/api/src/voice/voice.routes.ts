import { Router } from "express";
import { getAuth, requireAuth } from "../auth/require-auth.js";
import { createVoiceSession } from "./voice.service.js";

export const voiceRouter = Router();

voiceRouter.use(requireAuth);

// POST /api/voice/sessions: start a voice conversation. Returns everything the browser needs to
// connect to LiveKit directly; the API secret used to sign the token stays on this server.
// POST, not GET: each call creates a new room, and the response must not be cached.
voiceRouter.post("/sessions", async (req, res) => {
  const session = await createVoiceSession(getAuth(req).user);
  res.set("Cache-Control", "no-store");
  res.status(201).json({ data: session });
});
