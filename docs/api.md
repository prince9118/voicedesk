# API reference

Base URL in development: `http://localhost:4000`. The web app reaches the same API at `/api`, through the Vite proxy.

## Conventions

- Request and response bodies are JSON.
- Success: `{ "data": … }`. Failure: `{ "error": { "code": "…", "message": "…", "details": … } }`. Branch on `code`; `message` is for people.
- Unknown fields in a body or query string are rejected with `400`, so typos are not silently ignored.
- Every response carries an `X-Request-Id` header. Quote it when reporting a problem; it identifies the request in the logs.

## Authentication

| Caller | Header | Accepted by |
| --- | --- | --- |
| Signed-in user | `Authorization: Bearer <session token>` | all `/api/*` routes |
| Voice agent | `Authorization: Agent <AGENT_API_KEY>` **and** `X-Voice-Room: <room name>` | `/api/tickets/*` and `/api/kb/*` only; it acts as the user who owns the room |

A missing or invalid credential returns `401 UNAUTHENTICATED` with `WWW-Authenticate: Bearer realm="voicedesk"`.

## Health

| Method | Path | Description |
| --- | --- | --- |
| GET | `/health` | Liveness: the process is up. Never touches the database. |
| GET | `/ready` | Readiness: `200` when the database answers, otherwise `503 { "checks": { "database": "down" } }` |

## Accounts: `/api/auth`

| Method | Path | Body | Success |
| --- | --- | --- | --- |
| POST | `/register` | `{ email, name, password }` (password 12 to 128 characters) | `201 { user, token, expiresAt }` |
| POST | `/login` | `{ email, password }` | `200 { user, token, expiresAt }` |
| GET | `/me` | none | `200 user` |
| POST | `/logout` | none | `204`; this session's token stops working immediately |

`user` is `{ id, email, name, role }`, where `role` is `"customer"` or `"agent"`. Emails are matched case-insensitively. A wrong password and an unknown email return the same `401 INVALID_CREDENTIALS`.

## Tickets: `/api/tickets`

Customers see and edit only their own tickets. Agents (support staff) see and edit all of them.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/` | Body `{ subject, description, priority? }`. Customers may not set `priority` (`403`). Optional `Idempotency-Key` header, see below. Returns `201` with a `Location` header. |
| GET | `/` | Query `status?`, `priority?`, `limit?` (1 to 100, default 20), `cursor?`. Newest first. |
| GET | `/number/:number` | Look up by the short, spoken ticket number |
| GET | `/:id` | Look up by UUID |
| PATCH | `/:id` | Body: any of `subject`, `description`, `status`, `priority`. Customers may change only `subject` and `description`. |

A ticket is `{ id, number, subject, description, status, priority, userId, createdAt, updatedAt }`. `status` is one of `open`, `in_progress`, `resolved`, `closed`; `priority` is one of `low`, `medium`, `high`, `urgent`.

**Not found vs not yours.** Another user's ticket returns the same `404 TICKET_NOT_FOUND` as a ticket that does not exist, so ticket IDs cannot be probed.

**Pagination.** The list response is `{ data: [...], page: { limit, nextCursor } }`. Pass `nextCursor` back as `?cursor=` to get the next page; it is `null` on the last page. Cursors are opaque, so don't parse them.

**Idempotency.** Send `Idempotency-Key: <1 to 64 characters of A-Z a-z 0-9 . _ : ->` to make a create safe to retry:

| Situation | Response |
| --- | --- |
| First request with this key | `201` with the new ticket |
| Same key, same content (a retry) | `200` with the **original** ticket and `Idempotent-Replayed: true`; nothing new is created |
| Same key, different content | `422 IDEMPOTENCY_KEY_REUSED` |

Keys are scoped per user.

## Voice: `/api/voice`

| Method | Path | Success |
| --- | --- | --- |
| POST | `/sessions` | `201 { serverUrl, roomName, participantToken, expiresAt }` with `Cache-Control: no-store` |

Each call creates a new room. The token is valid for 10 minutes and only for connecting. It allows joining that one room with the microphone, and it tells LiveKit to dispatch the support agent.

## Help center: `/api/kb`

| Method | Path | Success |
| --- | --- | --- |
| GET | `/search?q=…&limit=1-5` | `200 [{ source: { slug, title }, heading, content, score }]` |

An empty list means nothing in the help center is relevant enough (score below 0.5). That is a valid answer, not an error.

## Error codes

| Status | Code | Meaning |
| --- | --- | --- |
| 400 | `VALIDATION_ERROR` | Invalid body, query, params or headers; `details.part` says which, `details.fieldErrors` says why |
| 400 | `INVALID_JSON` | The body is not valid JSON |
| 400 | `BAD_REQUEST` | The body could not be read for another reason |
| 401 | `UNAUTHENTICATED` | Missing, invalid, expired or revoked credentials |
| 401 | `INVALID_CREDENTIALS` | Wrong email or password |
| 403 | `FORBIDDEN` | Not allowed to set these fields; `details.fields` lists them |
| 404 | `TICKET_NOT_FOUND` / `NOT_FOUND` | No such ticket, or no such route |
| 409 | `EMAIL_TAKEN` | An account with this email exists |
| 413 | `PAYLOAD_TOO_LARGE` | The body is larger than 100 kB |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | Unsupported charset or encoding |
| 422 | `IDEMPOTENCY_KEY_REUSED` | The key was already used for a different request |
| 429 | `RATE_LIMITED` | Too many sign-up or login attempts from this IP; see `Retry-After` |
| 429 | `VOICE_LIMIT_REACHED` | You used your daily calls; see `Retry-After` |
| 429 | `VOICE_CAPACITY_REACHED` | The site-wide daily call budget is used up |
| 500 | `INTERNAL_ERROR` | A bug on our side; details are logged, never returned |
| 503 | `SERVICE_UNAVAILABLE` | The database is unreachable; retry after the `Retry-After` header |
