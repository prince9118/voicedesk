# Design decisions

The significant choices, why they were made, and what would change them.

| # | Decision | Why | Revisit when |
| --- | --- | --- | --- |
| 1 | **Only the API touches the database**; the agent is an API client | One place for business rules and authorization; the LLM cannot bypass them | Never for authorization; read replicas are fine later |
| 2 | **Database-backed sessions, not JWTs** | Logout and role changes apply immediately; the cost is one indexed lookup per request | Request volume makes that lookup a measured bottleneck (cache it, still revocable) |
| 3 | **`crypto.scrypt` for passwords** | OWASP-listed and built into Node: no native module, no extra supply-chain dependency | Argon2id becomes available without a native dependency |
| 4 | **Room-bound agent delegation** (service key + room → user) | The agent cannot choose whose data it sees; prompt injection gains nothing | Multiple agent types need different permissions (add scoped grants per room) |
| 5 | **Ownership scope required by every store function** | Forgetting authorization becomes a compile error, not an IDOR | Never |
| 6 | **`404` for other users' tickets** | Does not reveal that a ticket exists | Never for private data |
| 7 | **Keyset (cursor) pagination** | Deep pages stay as fast as page 1, and results stay stable while new tickets arrive. EXPLAIN on 200k rows: 31 ms full scan → 0.13 ms index scan. | A UI needs "jump to page 50" (add offset for admin views only) |
| 8 | **Idempotency keys on ticket creation** | LLMs repeat tool calls, and timeouts hide successes; one issue per call becomes exactly one ticket | Other non-idempotent operations are added (reuse the same pattern) |
| 9 | **Explicit agent dispatch** (`agentName`) | The agent joins only support rooms, never every room in the project | Several agent types (route by name) |
| 10 | **Call recording off by default** | Recording voices needs consent; the SDK default is on | A product decision with legal review |
| 11 | **LiveKit Inference for STT, LLM and TTS** | One account and bill, no extra keys, a free tier for development | Costs at scale favour direct provider contracts, or a model is needed that LiveKit does not offer |
| 12 | **Postgres full-text search for RAG** | $0, no new dependencies, measured 12/12 with query rewriting | Paraphrases are missed in real calls, or the corpus reaches thousands of chunks or several languages (pgvector + embeddings) |
| 13 | **Prisma lives in `apps/api`**, not a shared package | Only one app uses the database (see #1), and a shared package would add build steps | A second service needs the schema |
| 14 | **`sessionStorage` for the web session token** | Survives reloads and clears with the tab; simpler than cookies plus CSRF protection | Deployment puts web and API on one site (consider httpOnly cookies) |
| 15 | **Exact dependency versions, avoiding releases younger than about 2 weeks** | Malicious npm releases are usually caught within days | A security fix is needed sooner |
| 16 | **Integration tests against a real database** | The bugs that mattered (slow queries, tie ordering, constraint errors) only appear with a real database | Never; add unit tests for pure logic alongside |
