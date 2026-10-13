import { z } from "zod";
import { prisma } from "../db.js";

// Lexical retrieval with Postgres full-text search. 'english' stems words (refunded -> refund) and
// drops stopwords. Terms are OR-ed: the agent's LLM writes keyword queries with synonyms, so requiring
// every term (AND) would miss most matches. Ranking rewards chunks matching more and rarer terms,
// with the article title and section heading weighted above body text.

const MAX_TERMS = 16;

// Below this score a passage is treated as not relevant and the caller gets nothing back, so the
// assistant says "I don't know" instead of answering from a loosely related article.
// Chosen with `npm run kb:eval` (knowledge/eval.json): in-scope answers scored >= 0.737, single-word
// false positives ("phone number" -> refunds) <= 0.444. Re-run the eval whenever articles change.
export const MIN_SCORE = 0.5;

export interface KbPassage {
  source: { slug: string; title: string };
  heading: string;
  content: string;
  score: number;
}

// Build a to_tsquery expression from free text. Only letters and digits survive, so the user's (or
// the LLM's) text can never inject tsquery operators such as ! & : that would make Postgres throw.
export function toOrQuery(text: string): string | undefined {
  const terms = [...new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])]
    .filter((term) => term.length <= 30)
    .slice(0, MAX_TERMS);
  return terms.length > 0 ? terms.join(" | ") : undefined;
}

// $queryRaw's type parameter would be an unchecked cast, so rows are validated instead.
const rowSchema = z.object({
  slug: z.string(),
  title: z.string(),
  heading: z.string(),
  content: z.string(),
  score: z.number(),
});

export async function searchKnowledgeBase(text: string, limit: number): Promise<KbPassage[]> {
  const query = toOrQuery(text);
  if (!query) return [];

  // Tagged template: ${query} and ${limit} are sent as bind parameters, never spliced into the SQL.
  // ts_rank_cd normalization 32 maps scores into [0, 1) so MIN_SCORE is meaningful across queries.
  // The tsvector is computed per row at query time: fine for hundreds of chunks; with thousands,
  // store it in a generated column with a GIN index.
  const rows = await prisma.$queryRaw`
    SELECT d.slug, d.title, c.heading, c.content,
           ts_rank_cd(
             setweight(to_tsvector('english', d.title), 'A') ||
             setweight(to_tsvector('english', c.heading), 'A') ||
             setweight(to_tsvector('english', c.content), 'B'),
             q, 32
           )::float8 AS score
    FROM kb_chunks c
    JOIN kb_documents d ON d.id = c.document_id,
         to_tsquery('english', ${query}) q
    WHERE (
      setweight(to_tsvector('english', d.title), 'A') ||
      setweight(to_tsvector('english', c.heading), 'A') ||
      setweight(to_tsvector('english', c.content), 'B')
    ) @@ q
    ORDER BY score DESC, d.slug, c.position
    LIMIT ${limit}
  `;

  return z
    .array(rowSchema)
    .parse(rows)
    .filter((row) => row.score >= MIN_SCORE)
    .map((row) => ({
      source: { slug: row.slug, title: row.title },
      heading: row.heading,
      content: row.content,
      score: Math.round(row.score * 1000) / 1000,
    }));
}
