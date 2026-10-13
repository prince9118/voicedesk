# Status and roadmap

## Done

| Milestone | Highlights |
| --- | --- |
| 1. Ticket REST API | Zod validation, consistent response shapes, correct HTTP semantics |
| 2. PostgreSQL + Prisma | Docker database, migrations, database-enforced invariants |
| 3. Reliability | Startup config validation, `/health` vs `/ready`, `503` on outages, central error handling, structured logs, keyset pagination, integration tests |
| 4. Auth | scrypt passwords, revocable sessions, roles, row- and field-level authorization |
| 5. LiveKit | Short-lived, least-privilege room tokens issued by the API |
| 6. Voice agent | STT → LLM → TTS pipeline, explicit dispatch, recording opt-in |
| 7. Tool calling | Ticket lookup and creation, room-bound delegation, idempotency, timeouts and bounded retries |
| 8. Knowledge base | Ingestion, full-text retrieval with a measured threshold, grounded answers with sources |
| 9. Web app | React UI with an audio-reactive voice orb, error and permission handling, reduced-motion support |

Test suites: API 120 tests, agent 13 tests.

## Known issues

| Issue | Impact | Notes |
| --- | --- | --- |
| **Intermittent test-runner crash** ("Worker exited unexpectedly") | About 1 in 6 API test runs, more under load; a run that crashes is reported as failed, never as passing | Not caused by scrypt (stress-tested), and no single test file triggers it. Root cause still open. |
| `sharp` advisory (CVE in librsvg) via `@livekit/agents` | High in npm audit; low real risk, because the agent never processes SVG | The SDK pins an exact `sharp` version and npm overrides did not take effect; recheck on each SDK upgrade |
| Prisma CLI advisories (`deepmerge-ts`, `mysql2`) | Development tooling only, not in the request path | npm's suggested fix is a downgrade to Prisma 6 |
| npm 10.8 crashes on some peer dependencies | `npm install` fails with `edgesOut` | Use npm 11 (bundled with Node 24) |
| No frontend tests | UI regressions are caught only by hand | Planned below |
| No rate limiting | Login guessing is slowed by scrypt but not stopped | Planned below |
| Graceful shutdown has no time limit | One stuck request can block shutdown | Planned below |
| CORS allows any origin | Low risk with bearer tokens | Restrict at deployment |
| Expired sessions are not cleaned up | Tables grow slowly | Scheduled cleanup planned |

## Next

**Milestone 10: production readiness.**

- Root-cause the test-runner crash.
- Rate limits on login, registration and voice sessions.
- A shutdown time limit.
- Expired-session cleanup.
- Frontend component tests and an end-to-end browser test.
- Per-call usage and latency metrics for cost tracking.

**Milestone 11: deployment.**

- Hosting for the API, agent, database and web app on low-cost tiers.
- Restricted CORS and a Content-Security-Policy.
- Production health checks.
- A short case study of the project.
