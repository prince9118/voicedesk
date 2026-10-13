# Knowledge base (RAG)

The assistant answers how-to and policy questions from VoiceDesk's own help articles instead of from the LLM's general knowledge, which does not know *our* refund policy.

## Adding or editing articles

Articles are Markdown files in `apps/api/knowledge/`:

```markdown
# Refunds                      ← article title

## How long a refund takes     ← one section = one searchable chunk
Once a refund is approved, …
```

Then run, from `apps/api`:

```powershell
npm run kb:ingest    # load changes into the database
npm run kb:eval      # check retrieval quality still holds
```

Ingestion is safe to run repeatedly:

- Unchanged files are skipped (compared by SHA-256).
- A changed article has all its chunks replaced in **one transaction**, so a search never sees a half-updated article.
- An article whose file was deleted is **removed**, so the assistant cannot quote stale content.
- Sections longer than 1,200 characters are split at paragraph breaks.

## How retrieval works

1. The agent's LLM turns the caller's words into **support keywords plus synonyms**: "my money hasn't come back" becomes "refund not received money back".
2. `GET /api/kb/search` runs PostgreSQL full-text search with the `english` configuration, which handles stemming (*refunded* → *refund*) and drops stopwords. The terms are combined with OR.
3. Results are ranked with `ts_rank_cd`, weighting article titles and section headings above body text.
4. Passages scoring below **0.5** are dropped. If nothing is left, the agent says it does not have that information and offers to open a ticket.
5. Each passage carries its source article and section, so answers can be attributed ("According to our Refunds article…").

## Measured quality

`knowledge/eval.json` holds 15 cases: 12 questions with a known right article, and 3 that the help center cannot answer. The 3 out-of-scope cases check that retrieval returns nothing instead of a confident wrong answer.

| Threshold | Right article ranked first | Out-of-scope questions correctly empty |
| --- | --- | --- |
| 0.1 | 12/12 | 1/3: "phone number" matched Refunds |
| **0.5 (current)** | **12/12** | **3/3** |

The threshold sits in the measured gap: correct answers scored at least 0.737, false positives at most 0.444. Fifteen cases is a small set, so this is a reasonable starting point, not a proven value. **Re-run the evaluation whenever articles change**, and add a case for every bad answer seen in a real call.

## Known limitation: paraphrases

Full-text search matches words, not meaning. Measured on raw caller speech, without the LLM rewriting step:

| Raw caller words | Result |
| --- | --- |
| "my money hasn't come back yet" | nothing |
| "I can't get into my account" | **Account deletion: a confident wrong answer** |
| "you took my money twice" | nothing |

With the rewritten keyword queries, all three found the right article. Query rewriting is therefore required, and both the tool description and the agent's instructions enforce it.

## Why full-text search and not embeddings

| | Full-text search (current) | Local embeddings | Hosted embeddings |
| --- | --- | --- | --- |
| Cost | $0 | $0 | Pennies, plus a new provider account and key |
| New dependencies | none | ~100 MB of native ONNX runtime, plus a `sharp` version with a known high-severity advisory | SDK and network calls |
| Paraphrases | needs LLM query rewriting | handled | handled |

At a few dozen chunks, full-text search with query rewriting is the right size. **Switch to embeddings** (pgvector plus a hosted embedding model) when real calls show paraphrases being missed, when the corpus grows to thousands of chunks, or when other languages are needed.

## Scaling notes

- The full-text vector is computed per row at query time, which is fine for hundreds of chunks. For thousands, store it in a generated `tsvector` column with a GIN index.
- Help articles are public content, but search still requires authentication: it costs database work, and only our users and agent need it.
