import { Router } from "express";
import { z } from "zod";
import { requireUserOrVoiceAgent } from "../auth/require-auth.js";
import { parseInput } from "../validation.js";
import { searchKnowledgeBase } from "./kb.search.js";

export const kbRouter = Router();

// Help articles are not private, but search is still behind auth: it costs database work, and only
// our users and our voice agent need it.
kbRouter.use(requireUserOrVoiceAgent);

const searchQuerySchema = z.strictObject({
  q: z.string().trim().min(1).max(300),
  limit: z.coerce.number().int().min(1).max(5).default(3),
});

// GET /api/kb/search?q=refund+not+received
// Returns the best-matching passages with their source article, or an empty list when nothing is
// relevant enough: an empty result is a valid answer ("not in the help center"), so it is a 200.
kbRouter.get("/search", async (req, res) => {
  const { q, limit } = parseInput(searchQuerySchema, req.query, "query");
  res.status(200).json({ data: await searchKnowledgeBase(q, limit) });
});
