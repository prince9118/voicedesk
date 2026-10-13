# Architecture

## Components

| Component | Location | Responsibility |
| --- | --- | --- |
| **Web app** | `apps/web` | Sign-in, ticket list, voice call UI. Talks to the API over HTTPS and to LiveKit over WebRTC. |
| **API** | `apps/api` | The only component that touches the database. Owns authentication, authorization, tickets, voice-session tokens and help-center search. |
| **Voice agent** | `apps/agent` | A worker that LiveKit dispatches into support calls. Runs speech-to-text → LLM → text-to-speech and calls the API through tools. |
| **PostgreSQL** | Docker | Users, sessions, tickets, voice sessions, help-center articles. |
| **LiveKit Cloud** | managed | WebRTC media routing (an SFU), agent dispatch, and LiveKit Inference for the AI models. |

### Why the agent does not use the database

Business rules and authorization live in one place: the API. If the agent queried the database directly, every rule (ownership, field permissions, validation) would need a second implementation that the LLM could be talked around. Instead the agent is just another API client with deliberately limited powers. See [security](security.md#how-the-voice-agent-acts-for-a-customer).

## Request flows

### Signing in

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant D as PostgreSQL
  B->>A: POST /api/auth/login {email, password}
  A->>D: find user by (lowercased) email
  A->>A: scrypt verify (same work for unknown emails)
  A->>D: insert session (SHA-256 of a random token)
  A-->>B: { user, token }
  Note over B: token kept in sessionStorage,<br/>sent as "Authorization: Bearer …"
```

### Starting a voice call

```mermaid
sequenceDiagram
  participant B as Browser
  participant A as API
  participant D as PostgreSQL
  participant L as LiveKit Cloud
  participant G as Voice agent
  B->>A: POST /api/voice/sessions (Bearer token)
  A->>A: pick a new random room "support-<uuid>"
  A->>D: voice_sessions: room → this user (valid 1 h)
  A->>A: sign 10-minute room token (mic only, + dispatch "voicedesk-support")
  A-->>B: { serverUrl, roomName, participantToken }
  B->>L: connect over WebRTC with the token
  L->>G: job: join room support-<uuid>
  G->>L: join, greet the caller
```

The server chooses the room name. If the browser could choose it, a user could ask for a token to someone else's call.

### A tool call during the conversation

```mermaid
sequenceDiagram
  participant C as Caller
  participant G as Voice agent
  participant A as API
  participant D as PostgreSQL
  C->>G: "What's the status of ticket 1042?"
  G->>G: LLM decides to call get_ticket_status(1042)
  G->>A: GET /api/tickets/number/1042<br/>Authorization: Agent <key><br/>X-Voice-Room: support-<uuid>
  A->>D: voice_sessions: whose room is this? → Alice
  A->>D: SELECT … WHERE number = 1042 AND user_id = Alice
  A-->>G: ticket, or 404 (missing and "not yours" look the same)
  G-->>C: "Ticket 1042 is in progress."
```

The LLM chooses *which tool to call*. The API decides *what data comes back*. The room name comes from LiveKit's job, never from the LLM.

### A help-center question

```mermaid
sequenceDiagram
  participant C as Caller
  participant G as Voice agent
  participant A as API
  C->>G: "My money hasn't come back"
  G->>G: LLM rewrites to keywords: "refund not received money back"
  G->>A: GET /api/kb/search?q=…
  A->>A: Postgres full-text search, keep scores ≥ 0.5
  A-->>G: passages with source article, or []
  G-->>C: "According to our Refunds article, …" / "I don't have that; shall I open a ticket?"
```

## Data model

```mermaid
erDiagram
  users ||--o{ sessions : "logs in"
  users ||--o{ tickets : owns
  users ||--o{ voice_sessions : "starts calls"
  kb_documents ||--o{ kb_chunks : "split into"

  users { uuid id PK
          varchar email UK
          text password_hash
          enum role "customer | agent" }
  sessions { uuid id PK
             char64 token_hash UK
             uuid user_id FK
             timestamptz expires_at }
  tickets { uuid id PK
            int number UK "spoken reference"
            varchar subject
            text description
            enum status
            enum priority
            uuid user_id FK
            varchar idempotency_key "unique per user" }
  voice_sessions { uuid id PK
                   varchar room_name UK
                   uuid user_id FK
                   timestamptz expires_at }
  kb_documents { uuid id PK
                 varchar slug UK
                 char64 content_hash }
  kb_chunks { uuid id PK
              uuid document_id FK
              varchar heading
              text content }
```

Rules the database enforces itself, so a bug or a manual script cannot break them:

- Ticket `status`, `priority` and user `role` are Postgres enums.
- `email`, `token_hash`, `room_name`, ticket `number`, and `(user_id, idempotency_key)` are unique.
- Deleting a user deletes their sessions and voice sessions, but is **refused** while they still own tickets (`ON DELETE RESTRICT`), so support history cannot vanish by accident.
- Timestamps are `timestamptz(3)`: millisecond precision, matching JavaScript `Date`, which keyset pagination depends on.

## Inside the API

```text
request → httpLogger (request ID) → cors → express.json
        → router (auth middleware → parseInput (Zod) → policy check → store)
        → errorHandler (AppError → its status; DB outage → 503; anything else → 500)
```

| Layer | Example | Rule |
| --- | --- | --- |
| Routes | `tickets/ticket.routes.ts` | HTTP only: validate input, call the store, choose the status code |
| Policy | `tickets/ticket.policy.ts` | Who may see or change what; all ticket rules in one file |
| Store | `tickets/ticket.store.ts` | Database access; every query takes a required ownership scope |
| Config | `config.ts` | The only file that reads `process.env`, validated at startup |
| Errors | `errors.ts`, `error-handler.ts` | One place decides what an error response looks like |

Responses always have the shape `{ "data": … }` or `{ "error": { "code", "message", "details"? } }`.
