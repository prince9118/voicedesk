# Voice agent

Code: `apps/agent/src`. Built on the [LiveKit Agents](https://docs.livekit.io/agents/) SDK for Node.js, version 1.9.0.

## How it runs

- The worker registers with LiveKit Cloud as **`voicedesk-support`** and waits.
- It is dispatched **explicitly**: LiveKit sends it only into rooms whose token names it, never into every room in the project.
- **Each call runs in its own child process**, so one crashing call cannot take down the others.
- `npm run dev` uses the SDK's built-in CLI. LiveKit now recommends its `lk` CLI instead, so the SDK prints a deprecation warning.

## The pipeline

```text
caller audio → STT (Deepgram Nova-3, English) → LLM (GPT-4.1 mini) → TTS (Deepgram Aura-2) → audio back
                      ↑ turn detection decides when the caller has finished speaking
```

- **Streaming.** Every stage streams, so the agent starts speaking before the LLM has finished its reply.
- **Turn detection.** LiveKit's turn-detector model predicts whether the caller has *finished their thought*, not just whether they went quiet. That keeps the agent from cutting in during a mid-sentence pause. It runs locally in the worker.
- **Interruptions.** If the caller talks over the agent, speech stops and the in-flight reply is cancelled. Tool calls receive an `abortSignal`, which cancels their HTTP requests too.

All three models run through **LiveKit Inference**, so there are no separate STT, LLM or TTS provider accounts or keys. Usage is billed to the LiveKit project.

### Why these models

| Model | Why |
| --- | --- |
| Deepgram Nova-3 | Low-latency streaming English STT, $0.0048 per minute |
| GPT-4.1 mini | Fast and **not** a reasoning model, so there is no "thinking" delay before it speaks; reliable tool calling |
| Deepgram Aura-2 | Low latency, half the price of Cartesia Sonic 3 |

Prices are LiveKit's published Build-plan rates as of October 2026.

## Tools

| Tool | What it does | Notes |
| --- | --- | --- |
| `get_ticket_status(ticketNumber)` | Looks up one of the caller's tickets | Reads the number back, because speech recognition mishears numbers. "Not found" and "not yours" give the same answer. |
| `list_my_tickets()` | The caller's five most recent tickets | |
| `create_ticket(subject, description)` | Opens a ticket for the caller | Must read the ticket back and hear "yes" first. At most 3 per call. Idempotent (below). |
| `search_help_articles(query)` | Searches the help center | The query must be rewritten into keywords and synonyms; see [knowledge base](knowledge-base.md) |

Every tool argument is validated with Zod before any request is made, so a hallucinated `ticket abc` never reaches the API.

### What the tools tell the LLM

| Outcome | What the LLM receives |
| --- | --- |
| Success | Only the fields worth saying aloud; ticket descriptions are left out (prompt-injection surface, and the caller already knows them) |
| Not found | A normal result: `{ found: false, … }` |
| System unavailable | A `ToolError` saying exactly that, for example "The ticket was **NOT** created", so the agent cannot announce something that did not happen |

### Duplicate ticket protection

LLMs sometimes call a tool twice, and a timed-out request may have succeeded anyway. `create_ticket` sends an `Idempotency-Key` derived from the room name plus the normalized subject. Within one call, the same issue can therefore only ever become one ticket, and a retry returns the original. The API enforces this with a unique index.

## Reliability

The agent's API client (`voicedesk-api.ts`) treats the API as an unreliable network dependency:

| Situation | Behaviour |
| --- | --- |
| Slow API | 4-second timeout per attempt; a caller is waiting in silence |
| Network error, timeout, `503` | **One** retry after 300 ms, only for idempotent requests (GETs, and creates with a key) |
| `400`, `401`, `403`, `422` | No retry: the request is wrong, not the network |
| Caller interrupted | The request is cancelled and **not** retried |
| Response doesn't match the expected shape | Treated as unavailable; never passed to the LLM |

## Call summary

When a call ends the agent logs one structured line, `Call summary`, so cost and speed can be tracked per call:

```json
{
  "durationSeconds": 23,
  "turns": 2,
  "toolCalls": 1,
  "responseLatencyMs": { "average": 2500, "p95": 2618, "max": 2618 },
  "usage": { "sttSeconds": 0, "ttsCharacters": 346, "llmInputTokens": 2655, "llmOutputTokens": 99 },
  "estimatedCostUsd": 0.0116
}
```

(A real call from development: a typed question answered from the help center, so no speech-to-text time.)

- **Response latency** runs from the assistant starting to think (the caller has finished) to it starting to speak. The first "thinking" of a turn counts, so time spent in tool calls is included: that is the wait the caller feels. An answer the caller interrupted is not timed.
- **Usage** comes from the SDK's per-model records: audio seconds for speech-to-text, characters for text-to-speech, tokens for the LLM.
- **Cost** is an estimate from LiveKit's list prices (constants in `src/call-summary.ts`), not a bill.
- The logic is in `call-summary.ts` with no SDK imports, and is covered by 11 tests.

## Costs

A rough estimate for a 5-minute call: STT about $0.024, TTS about $0.06 (the agent speaking roughly 2,000 characters), LLM about $0.01, so **about $0.10 per call**. The free plan's $2.50 of inference credit covers roughly 20 to 25 test calls. This is an estimate, not a measurement; per-call usage metrics are on the roadmap.

## Changing behaviour

- **Instructions and tools:** `src/support-agent.ts`
- **Models and turn detection:** `src/main.ts`
- **Configuration:** `src/config.ts`. All variables are validated at startup.
