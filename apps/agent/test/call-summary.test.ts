import { describe, expect, it } from "vitest";
import { CallStats, estimateCostUsd, percentile, sumUsage, type UsageRecord } from "../src/call-summary.js";

describe("percentile", () => {
  it("uses the nearest-rank method", () => {
    const v = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentile(v, 50)).toBe(500);
    expect(percentile(v, 95)).toBe(1000);
    expect(percentile(v, 10)).toBe(100);
  });

  it("does not depend on input order, and does not modify its input", () => {
    const v = [900, 100, 500];
    expect(percentile(v, 50)).toBe(500);
    expect(v).toEqual([900, 100, 500]);
  });

  it("is 0 for no samples", () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe("usage and cost", () => {
  const records: UsageRecord[] = [
    { type: "stt_usage", audioDurationMs: 90_000 },
    { type: "tts_usage", charactersCount: 2_000 },
    { type: "llm_usage", inputTokens: 5_000, outputTokens: 400 },
    { type: "eot_usage" }, // other kinds are ignored
  ];

  it("adds up speech, characters and tokens across records", () => {
    expect(sumUsage(records)).toEqual({ sttSeconds: 90, ttsCharacters: 2_000, llmInputTokens: 5_000, llmOutputTokens: 400 });
  });

  it("estimates cost from the published per-unit prices", () => {
    // STT: 1.5 min x $0.0048 = 0.0072; TTS: 2,000 chars x $30/1M = 0.06; LLM: 5k x $0.40/1M + 400 x $1.60/1M = 0.00264
    expect(estimateCostUsd(sumUsage(records))).toBeCloseTo(0.0698, 4);
  });

  it("costs nothing when nothing was used", () => {
    expect(estimateCostUsd(sumUsage([]))).toBe(0);
  });
});

describe("CallStats", () => {
  it("measures how long the assistant took to start speaking after the caller finished", () => {
    const stats = new CallStats(0);
    stats.onAgentState("listening", 1_000);
    stats.onAgentState("thinking", 5_000);
    stats.onAgentState("speaking", 5_800); // answered in 800 ms
    stats.onAgentState("listening", 9_000);
    stats.onAgentState("thinking", 12_000);
    stats.onAgentState("speaking", 14_200); // 2,200 ms

    const summary = stats.summary([], 20_000);

    expect(summary.turns).toBe(2);
    expect(summary.responseLatencyMs).toEqual({ average: 1500, p95: 2200, max: 2200 });
    expect(summary.durationSeconds).toBe(20);
  });

  it("counts time spent in tool calls, because the caller waits through it", () => {
    const stats = new CallStats(0);
    stats.onAgentState("thinking", 1_000); // decides to call a tool
    stats.onAgentState("thinking", 2_500); // thinks again after the tool returns: not a new turn
    stats.onAgentState("speaking", 3_000);

    expect(stats.summary([], 4_000).responseLatencyMs?.max).toBe(2_000);
  });

  it("does not time an answer the caller interrupted", () => {
    const stats = new CallStats(0);
    stats.onAgentState("thinking", 1_000);
    stats.onAgentState("listening", 1_500); // caller spoke again before any answer
    stats.onAgentState("speaking", 9_000); // unrelated later speech: nothing to measure from

    expect(stats.summary([], 10_000).turns).toBe(0);
  });

  it("reports no latency (null) for a call with no answers", () => {
    expect(new CallStats(0).summary([], 5_000).responseLatencyMs).toBeNull();
  });

  it("counts tool calls and rolls everything into one summary", () => {
    const stats = new CallStats(0);
    stats.onToolsExecuted(1);
    stats.onToolsExecuted(2);

    const summary = stats.summary([{ type: "tts_usage", charactersCount: 1_000 }], 61_400);

    expect(summary).toMatchObject({ toolCalls: 3, durationSeconds: 61, estimatedCostUsd: 0.03 });
    expect(summary.usage.ttsCharacters).toBe(1_000);
  });
});
