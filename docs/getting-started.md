# Getting started

## Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | 24.x | Runtime for all three apps |
| npm | 11 recommended | npm 10.8 crashes resolving some peer dependencies (see [roadmap](roadmap.md#known-issues)) |
| Docker Desktop | recent | Runs PostgreSQL locally |
| LiveKit Cloud account | free "Build" plan | Voice rooms and AI models; no credit card needed |

The commands below are for PowerShell on Windows; they work the same in bash.

## 1. Install dependencies

```powershell
cd E:\projects\voicedesk     # or wherever you cloned it
npm install
```

This installs all three workspaces (`apps/api`, `apps/agent`, `apps/web`).

## 2. Start PostgreSQL

```powershell
docker compose up -d --wait
docker compose ps            # should show voicedesk-postgres as "healthy"
```

The database listens on `127.0.0.1:5432` only, so it is not reachable from other machines on your network. Its data survives `docker compose down`, because it lives in a named volume.

## 3. Create a LiveKit Cloud project

1. Sign up at [cloud.livekit.io](https://cloud.livekit.io) and create a project.
2. Under **Settings → API keys**, create a key. You get a URL (`wss://….livekit.cloud`), an API key and an API secret.

## 4. Configure environment variables

Copy each example file and fill in the values:

```powershell
Copy-Item apps/api/.env.example apps/api/.env
Copy-Item apps/agent/.env.example apps/agent/.env
```

Generate the shared agent key once and put the **same value** in both files:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

### `apps/api/.env`

| Variable | Required | Description |
| --- | --- | --- |
| `DATABASE_URL` | yes | `postgresql://voicedesk:voicedesk@localhost:5432/voicedesk` for the Docker database |
| `LIVEKIT_URL` | yes | Your project's `wss://` URL; this is the only LiveKit value sent to browsers |
| `LIVEKIT_API_KEY` | yes | Signs room tokens |
| `LIVEKIT_API_SECRET` | yes | Signs room tokens; **never leaves the server** |
| `AGENT_API_KEY` | yes | Shared secret the voice agent uses to call the API (at least 32 characters) |
| `PORT` | no | Default `4000` |
| `NODE_ENV` | no | `development` (pretty logs), `test` or `production` (JSON logs) |
| `LOG_LEVEL` | no | Default `info` |
| `LIVEKIT_AGENT_NAME` | no | Default `voicedesk-support`; must match the agent |

### `apps/agent/.env`

| Variable | Required | Description |
| --- | --- | --- |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | yes | Same project as the API |
| `AGENT_API_KEY` | yes | Same value as in the API |
| `VOICEDESK_API_URL` | yes | `http://localhost:4000` |
| `LIVEKIT_AGENT_NAME` | no | Default `voicedesk-support` |
| `AGENT_RECORD_SESSIONS` | no | Default `false`. When `true`, call audio and transcripts are uploaded to LiveKit Cloud. See [security](security.md#privacy). |

Both apps validate their configuration at startup and exit with a clear message if something is missing or invalid. `.env` files are gitignored; never commit them.

Check the LiveKit credentials:

```powershell
cd apps/api
npm run livekit:check        # "OK: LiveKit accepted the credentials…"
```

## 5. Prepare the database

```powershell
cd apps/api
npx prisma migrate deploy    # apply all migrations
npx prisma generate          # generate the typed client into src/generated (gitignored)
npm run kb:ingest            # load the help-center articles from apps/api/knowledge
```

## 6. Run the apps

Use one terminal for each:

```powershell
cd apps/api;   npm run dev   # API on http://localhost:4000
cd apps/agent; npm run dev   # wait for "registered worker"
cd apps/web;   npm run dev   # open http://localhost:5173
```

Create an account in the web app, then choose **Start call** and allow microphone access. The Vite dev server forwards `/api` requests to the API, so no CORS setup is needed in development.

## Tests

```powershell
cd apps/api;   npm test      # integration tests against a separate voicedesk_test database
cd apps/agent; npm test      # unit tests for the agent's API client and call summary
cd apps/web;   npm test      # component and API-client tests in a simulated browser
npm run typecheck            # in any app: typechecks source and tests
```

The API tests create `voicedesk_test` tables automatically (`prisma migrate deploy` runs before each test run). They refuse to run against any database whose name does not end in `_test`, so they cannot wipe your development data. Create the test database once:

```powershell
"CREATE DATABASE voicedesk_test;" | docker exec -i voicedesk-postgres psql -U voicedesk -d voicedesk
```

The same suites run on every push in GitHub Actions ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)): the API tests against a PostgreSQL service container, the agent and web tests, and a production build of the web app.

## Useful scripts (`apps/api`)

| Script | What it does |
| --- | --- |
| `npm run user:set-role -- <email> <customer\|agent>` | Promote or demote a user (support staff are "agents") |
| `npm run livekit:check` | Verify the LiveKit credentials against LiveKit Cloud |
| `npm run kb:ingest` | Load or refresh help articles (unchanged files are skipped; deleted ones removed) |
| `npm run kb:eval` | Measure retrieval quality against `knowledge/eval.json` |
| `npx prisma studio` | Browse the database in a web UI |

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Invalid environment configuration` at startup | A required variable is missing; the message names it |
| API returns `503 SERVICE_UNAVAILABLE` | PostgreSQL is not running: `docker compose up -d --wait` |
| Call connects but the assistant never speaks | The agent is not running, or `LIVEKIT_AGENT_NAME` differs between API and agent |
| Assistant says the ticket system is unavailable | `AGENT_API_KEY` differs between the two `.env` files, or the API is down |
| `Cannot read properties of null (reading 'edgesOut')` during `npm install` | npm 10 peer-dependency bug; use npm 11 |
| `Failed to resolve import "@fontsource…"` (or any package) | `node_modules` no longer matches `package.json`, usually after switching branches or discarding changes: run `npm install` at the repository root |
