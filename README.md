# VoiceDesk

**A voice-first AI customer-support platform.** Customers talk to an AI assistant in the browser. The assistant can look up their tickets, open new ones, and answer how-to questions from the help center, and it only ever sees the caller's own data.

## Demo

[![VoiceDesk landing page. Click to watch the 22-second demo video](docs/images/demo-poster.png)](docs/media/voicedesk-demo.webm)

**▶ [Watch the demo video](docs/media/voicedesk-demo.webm)** (22 seconds, WebM, no sound)

The video walks through the whole product, uncut:

1. The landing page in dark mode, with its preview of a call.
2. Signing up through the dialog.
3. The dashboard, then switching to light mode.
4. Starting a call. The real voice agent joins and greets the caller ("Hello, this is the VoiceDesk…"), and the orb follows its voice.
5. Ending the call.

It was recorded automatically with Playwright using a simulated microphone, so the assistant greets but there is no spoken conversation. The pause after the call connects is the agent starting up (about 9 seconds), which is on the [roadmap](docs/roadmap.md) to shorten.

| A live call: the assistant speaking | The landing page's feature overview |
| --- | --- |
| ![A voice call in progress: the orb labelled "Speaking" above the assistant's greeting](docs/images/call-speaking.png) | ![Landing page feature cards: ticket status by voice, hands-free tickets, grounded answers, natural conversation](docs/images/landing-features.png) |

## What it does

- **Real-time voice calls** over WebRTC (LiveKit Cloud). The animated orb reacts to the actual audio level and shows whether the assistant is listening, thinking or speaking.
- **An AI support agent** (speech-to-text → LLM → text-to-speech) that can be interrupted mid-sentence and detects when you have finished speaking.
- **Tool calling with real authorization.** The agent checks ticket status by spoken number ("ticket 1042"), lists your tickets, and creates tickets after reading them back to you. It acts *as the caller*, enforced by the API rather than the LLM.
- **Help-center answers (RAG)** grounded in the knowledge base, with the source article named, and an "I don't know, shall I open a ticket?" fallback when nothing relevant is found.
- **A ticket REST API** with validation, ownership rules, keyset pagination and idempotent creation.
- **Accounts:** scrypt password hashing and revocable sessions, with customer and support-agent roles.

## Architecture

```mermaid
flowchart LR
  subgraph Browser
    WEB["React web app<br/>(Vite, Motion, LiveKit components)"]
  end

  subgraph Server["Your servers"]
    API["Express API<br/>auth · tickets · voice sessions · help search"]
    AGENT["Voice agent worker<br/>(LiveKit Agents, Node.js)"]
    DB[("PostgreSQL<br/>users · sessions · tickets<br/>voice_sessions · kb_*")]
  end

  subgraph Cloud["LiveKit Cloud"]
    SFU["WebRTC media server"]
    INF["LiveKit Inference<br/>STT · LLM · TTS"]
  end

  WEB -- "HTTPS /api (Bearer session token)" --> API
  API --- DB
  WEB -- "WebRTC audio (room token from API)" --> SFU
  SFU -- "dispatches job: voicedesk-support" --> AGENT
  AGENT -- "audio in / out" --> SFU
  AGENT -- "speech & language models" --> INF
  AGENT -- "tools: Agent key + room name" --> API
```

The API owns all data and every authorization decision. The agent never touches the database; it calls the API with a service key plus the LiveKit room name, and the API acts as the user that room was created for. See [docs/architecture.md](docs/architecture.md) for the request flows.

## Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript (strict) everywhere |
| Frontend | React 19, Vite 7, Tailwind CSS 4, Motion, LiveKit React components |
| API | Node.js 24, Express 5, Zod 4 |
| Database | PostgreSQL 17 (Docker), Prisma 7 with the `pg` driver adapter |
| Voice | LiveKit Cloud (WebRTC), LiveKit Agents for Node.js |
| AI models | Via LiveKit Inference: Deepgram Nova-3 (STT), GPT-4.1 mini (LLM), Deepgram Aura-2 (TTS) |
| Retrieval | PostgreSQL full-text search, measured with an evaluation set |
| Logging | pino structured JSON logs with request IDs |
| Tests | Vitest and Supertest against a real test database |

## Repository layout

```text
voicedesk/
├── apps/
│   ├── api/          Express REST API, Prisma schema & migrations, help-center articles
│   ├── agent/        LiveKit voice agent and its tools
│   └── web/          React frontend
├── docs/             Project documentation (start at docs/README.md)
├── docker-compose.yml  Local PostgreSQL
└── package.json      npm workspaces
```

## Quick start

You need Node.js 24, Docker Desktop and a free [LiveKit Cloud](https://cloud.livekit.io) project. The full walkthrough is in [docs/getting-started.md](docs/getting-started.md).

```powershell
npm install
docker compose up -d --wait                      # PostgreSQL on localhost:5432

# Configure apps/api/.env and apps/agent/.env from their .env.example files, then:
cd apps/api;   npx prisma migrate deploy; npx prisma generate; npm run kb:ingest

# One terminal each:
cd apps/api;   npm run dev                        # http://localhost:4000
cd apps/agent; npm run dev                        # registers with LiveKit Cloud
cd apps/web;   npm run dev                        # http://localhost:5173
```

Run the tests with `npm test` in `apps/api` (against a separate `voicedesk_test` database) and in `apps/agent`.

## Documentation

| Document | What it covers |
| --- | --- |
| [Getting started](docs/getting-started.md) | Prerequisites, environment variables, running every part locally, scripts |
| [Architecture](docs/architecture.md) | Components, request flows, data model |
| [API reference](docs/api.md) | Every endpoint, request and response shapes, error codes |
| [Security](docs/security.md) | Authentication, authorization, agent delegation, secrets, privacy |
| [Voice agent](docs/voice-agent.md) | Pipeline, tools, models, costs, reliability |
| [Knowledge base](docs/knowledge-base.md) | Ingestion, retrieval, evaluation, known limits |
| [Design decisions](docs/decisions.md) | Key trade-offs, and what would change them |
| [Status and roadmap](docs/roadmap.md) | What is done, known issues, what is next |



## License

To be added (MIT is planned).
