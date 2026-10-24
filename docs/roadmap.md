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
| 9. Web app | React UI (Radix UI primitives): a single-prompt home screen where the customer types or talks, an ASCII backdrop that follows the call audio, live transcript, ticket history, error and permission handling, reduced-motion support |
| 10. Production readiness | Graceful shutdown with a 10-second deadline, hourly cleanup of expired sessions, per-call summary (latency, tool use, usage, estimated cost), 48 frontend tests, GitHub Actions CI on every push |

Test suites: API 139 tests, agent 24 tests, web app 48 tests (211 in total), all run on every push in GitHub Actions.

Since then: a landing page, light and dark themes, a refreshed app UI, usage limits, and a production Docker setup (Caddy with automatic HTTPS and a strict security policy), tested end to end locally.

## Known issues

| Issue | Impact | Notes |
| --- | --- | --- |
| **Intermittent test-runner crash** ("Worker exited unexpectedly") | About 1 in 4 API test runs on the Windows development machine, in clusters; none in some quiet periods. A crashed run is reported as failed, never as passing. | See [the investigation](#the-test-runner-crash) below. Passed on its first Linux CI run. |
| `sharp` advisory (CVE in librsvg) via `@livekit/agents` | High in npm audit; low real risk, because the agent never processes SVG | The SDK pins an exact `sharp` version and npm overrides did not take effect; recheck on each SDK upgrade |
| Prisma CLI advisories (`deepmerge-ts`, `mysql2`) | Development tooling only, not in the request path | npm's suggested fix is a downgrade to Prisma 6 |
| npm 10.8 crashes on some peer dependencies | `npm install` fails with `edgesOut` | Use npm 11 (bundled with Node 24) |
| No automated end-to-end browser test | Component tests use a simulated browser; the real call flow was checked by hand and by the recorded demo | Planned below |
| Per-IP limits live in memory | They reset on restart and are not shared across instances | Fine for one server; move to Postgres or Redis if the API is scaled out |
| Slow first answer in development | `npm run dev` starts a fresh agent process for each call (9 to 15 seconds), and on a busy machine it can time out ("runner initialization timed out") | Production mode (`npx tsx src/main.ts start`) keeps warm processes: with a warm agent, an answer that uses a tool starts in about 2.5 seconds (from the per-call summary). Re-measure after deployment. |

### The test-runner crash

What is established, from instrumenting the test workers and re-running the suite about 30 times:

- The worker process exits with Windows code **`0xC0000409`** (a "fast-fail" abort), sometimes within 2.5 seconds of starting, sometimes mid-file. The runner then reports "Worker exited unexpectedly" and the tests in that file are lost.
- Node writes **no diagnostic report** even with `--report-on-fatalerror`, so it is not a JavaScript error, an out-of-memory error or a V8 fatal error: native code aborted the process.
- It is **not** caused by scrypt (stress-tested earlier), by any single test file, or by a corrupted install: it also happens in a fresh clone after `npm ci`.
- Starting the database layer 150 times in parallel never crashed, so Prisma's startup alone is not the trigger.
- It comes in clusters: several crashes in a row, then many clean runs, which points at machine state rather than the code. The machine has 11 GB of RAM shared with Docker, WSL and a browser.
- The first GitHub Actions run on Linux (all 139 API tests) passed.

Next step: attach a Windows debugger (procdump or WinDbg) to a worker to see which native module aborts, or try another Node patch release. Until then CI on Linux is the reference result.

## Next

**Milestone 10: production readiness** (done: shutdown deadline, session cleanup, call summaries, frontend tests, CI).

- Root-cause the test-runner crash (see above).
- An end-to-end browser test of the main flow (sign in, ask, hear an answer).
- Collect the per-call summaries somewhere queryable, so cost and latency can be charted over time.

**Milestone 11: deployment** (Docker stack done and tested locally; AWS Lightsail hosting is next).

- Done: Dockerfiles, a production Compose stack, Caddy with automatic HTTPS, a strict Content-Security-Policy (zero violations in a browser test), CORS off (same origin), readiness health checks, and migrations on start.
- Next: host it on one AWS Lightsail server (2 GB, about $12 per month) with your own domain, then share the live link.
- A short case study of the project.
