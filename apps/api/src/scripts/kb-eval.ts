// Measures retrieval quality on knowledge/eval.json against the ingested knowledge base.
//   hit@1  : the expected article is the top result
//   hit@3  : the expected article is among the top three
//   correctly empty : out-of-scope questions return nothing (no confident wrong answer)
// Usage (from apps/api, after kb:ingest): npm run kb:eval
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { prisma } from "../db.js";
import { MIN_SCORE, searchKnowledgeBase } from "../kb/kb.search.js";

const evalFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../knowledge/eval.json");
const { cases } = z
  .object({ cases: z.array(z.object({ query: z.string(), expected: z.string().nullable() })) })
  .parse(JSON.parse(await readFile(evalFile, "utf8")));

let hit1 = 0;
let hit3 = 0;
let inScope = 0;
let emptyCorrect = 0;
let outOfScope = 0;

for (const { query, expected } of cases) {
  const results = await searchKnowledgeBase(query, 3);
  const slugs = results.map((r) => r.source.slug);
  const top = results[0];
  let verdict: string;
  if (expected === null) {
    outOfScope++;
    const ok = results.length === 0;
    if (ok) emptyCorrect++;
    verdict = ok ? "ok (empty)" : `FALSE POSITIVE -> ${top?.source.slug} (${top?.score})`;
  } else {
    inScope++;
    if (slugs[0] === expected) hit1++;
    if (slugs.includes(expected)) hit3++;
    verdict = slugs[0] === expected ? `ok (${top?.score})` : slugs.includes(expected) ? "hit@3 only" : `MISS -> [${slugs.join(", ")}]`;
  }
  console.log(`${verdict.padEnd(36)} ${query}`);
}

console.log(`\nthreshold ${MIN_SCORE}`);
console.log(`hit@1 ${hit1}/${inScope}   hit@3 ${hit3}/${inScope}   out-of-scope correctly empty ${emptyCorrect}/${outOfScope}`);
await prisma.$disconnect();
