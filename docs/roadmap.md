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
| 9. Web app | React UI (Radix UI primitives) with an audio-reactive bar visualizer and live transcript, error and permission handling, reduced-motion support |

Test suites: API 127 tests, agent 13 tests.

Since then: a landing page, light and dark themes, a refreshed app UI, usage limits, and a production Docker setup (Caddy with automatic HTTPS and a strict security policy), tested end to end locally.

## Known issues

| Issue | Impact | Notes |
| --- | --- | --- |
| **Intermittent test-runner crash** ("Worker exited unexpectedly") | About 1 in 6 API test runs, more under load; a run that crashes is reported as failed, never as passing | Not caused by scrypt (stress-tested), and no single test file triggers it. Root cause still open. |
| `sharp` advisory (CVE in librsvg) via `@livekit/agents` | High in npm audit; low real risk, because the agent never processes SVG | The SDK pins an exact `sharp` version and npm overrides did not take effect; recheck on each SDK upgrade |
| Prisma CLI advisories (`deepmerge-ts`, `mysql2`) | Development tooling only, not in the request path | npm's suggested fix is a downgrade to Prisma 6 |
| npm 10.8 crashes on some peer dependencies | `npm install` fails with `edgesOut` | Use npm 11 (bundled with Node 24) |
| No frontend tests | UI regressions are caught only by hand | Planned below |
| Per-IP limits live in memory | They reset on restart and are not shared across instances | Fine for one server; move to Postgres or Redis if the API is scaled out |
| Graceful shutdown has no time limit | One stuck request can block shutdown | Planned below |
| Slow first answer on a call (about 9 seconds) | Measured with the agent in dev mode, which starts a fresh process per call | Production mode keeps a warm process ready (seen in the container: ~575 MB idle); re-measure after deployment |
| Expired sessions are not cleaned up | Tables grow slowly | Scheduled cleanup planned |

## Next

**Milestone 10: production readiness.**

- Root-cause the test-runner crash.
- A shutdown time limit.
- Expired-session cleanup.
- Frontend component tests and an end-to-end browser test.
- Per-call usage and latency metrics for cost tracking.

**Milestone 11: deployment** (Docker stack done and tested locally; AWS Lightsail hosting is next).

- Done: Dockerfiles, a production Compose stack, Caddy with automatic HTTPS, a strict Content-Security-Policy (zero violations in a browser test), CORS off (same origin), readiness health checks, and migrations on start.
- Next: host it on one AWS Lightsail server (2 GB, about $12 per month) with your own domain, then share the live link.
- A short case study of the project.
