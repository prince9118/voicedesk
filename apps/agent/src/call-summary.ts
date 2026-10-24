// One structured log line per finished call: how long it ran, how fast the assistant answered, how
// many tools it used, and a cost estimate. Pure functions and a small class with no SDK or config
// imports, so they are easy to test and cannot affect a live call.

// LiveKit Inference list prices on the Build plan (October 2026); see docs/voice-agent.md.
// These are estimates for cost tracking, not a bill: check the LiveKit dashboard for the real figure.
export const PRICING = {
  sttPerMinuteUsd: 0.0048, // Deepgram Nova-3
  ttsPerMillionCharsUsd: 30, // Deepgram Aura-2
  llmInputPerMillionTokensUsd: 0.4, // GPT-4.1 mini
  llmOutputPerMillionTokensUsd: 1.6,
} as const;

// The subset of the SDK's per-model usage records that we read. Structural, so tests need no SDK.
export interface UsageRecord {
  type?: string;
  inputTokens?: number;
  outputTokens?: number;
  charactersCount?: number;
  audioDurationMs?: number;
}

export interface CallSummary {
  durationSeconds: number;
  turns: number;
  toolCalls: number;
  responseLatencyMs: { average: number; p95: number; max: number } | null;
  usage: { sttSeconds: number; ttsCharacters: number; llmInputTokens: number; llmOutputTokens: number };
  estimatedCostUsd: number;
}

// Nearest-rank percentile on a sorted copy: the smallest value with at least p% of samples at or below it.
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(1, Math.ceil((p / 100) * sorted.length));
  return sorted[rank - 1] ?? 0;
}

export function sumUsage(records: UsageRecord[]): CallSummary["usage"] {
  const total = { sttSeconds: 0, ttsCharacters: 0, llmInputTokens: 0, llmOutputTokens: 0 };
  for (const r of records) {
    if (r.type === "stt_usage") total.sttSeconds += (r.audioDurationMs ?? 0) / 1000;
    else if (r.type === "tts_usage") total.ttsCharacters += r.charactersCount ?? 0;
    else if (r.type === "llm_usage") {
      total.llmInputTokens += r.inputTokens ?? 0;
      total.llmOutputTokens += r.outputTokens ?? 0;
    }
  }
  return total;
}

export function estimateCostUsd(usage: CallSummary["usage"]): number {
  const cost =
    (usage.sttSeconds / 60) * PRICING.sttPerMinuteUsd +
    (usage.ttsCharacters / 1_000_000) * PRICING.ttsPerMillionCharsUsd +
    (usage.llmInputTokens / 1_000_000) * PRICING.llmInputPerMillionTokensUsd +
    (usage.llmOutputTokens / 1_000_000) * PRICING.llmOutputPerMillionTokensUsd;
  return Math.round(cost * 10_000) / 10_000;
}

// Collects what only the live session knows: when each answer started and how many tools ran.
export class CallStats {
  private readonly latencies: number[] = [];
  private thinkingSince: number | undefined;
  private tools = 0;

  constructor(private readonly startedAt: number = Date.now()) {}

  // Response latency = from the assistant starting to think (the caller finished) to it starting to speak.
  // The first "thinking" of a turn counts, so time spent in tool calls is part of the latency a caller feels.
  onAgentState(newState: string, at: number): void {
    if (newState === "thinking") {
      this.thinkingSince ??= at;
    } else if (newState === "speaking") {
      if (this.thinkingSince !== undefined) this.latencies.push(Math.max(0, at - this.thinkingSince));
      this.thinkingSince = undefined;
    } else if (newState === "listening") {
      this.thinkingSince = undefined; // interrupted, or finished without speaking: no answer to time
    }
  }

  onToolsExecuted(count: number): void {
    this.tools += count;
  }

  summary(records: UsageRecord[], endedAt: number = Date.now()): CallSummary {
    const usage = sumUsage(records);
    const l = this.latencies;
    return {
      durationSeconds: Math.max(0, Math.round((endedAt - this.startedAt) / 1000)),
      turns: l.length,
      toolCalls: this.tools,
      responseLatencyMs:
        l.length === 0
          ? null
          : { average: Math.round(l.reduce((a, b) => a + b, 0) / l.length), p95: percentile(l, 95), max: Math.max(...l) },
      usage: { ...usage, sttSeconds: Math.round(usage.sttSeconds * 10) / 10 },
      estimatedCostUsd: estimateCostUsd(usage),
    };
  }
}
