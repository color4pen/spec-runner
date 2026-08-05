/**
 * Unit tests for queryOneShot — invocation metrics extraction.
 *
 * TC-004: one-shot success result から 4 metrics を抽出する
 * TC-020: one-shot の turnCount placeholder が numTurns に置き換えられている
 */
import { describe, it, expect, vi } from "vitest";
import { queryOneShot, type QueryFn } from "../../../../src/adapter/claude-code/query-one-shot.js";
import type { SpecRunnerConfig } from "../../../../src/config/schema.js";

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-004: one-shot success result から 4 metrics を抽出する
// ---------------------------------------------------------------------------

describe("TC-004: one-shot success result から 4 metrics を抽出する", () => {
  it("extracts numTurns, durationMs, durationApiMs, totalCostUsd from success result", async () => {
    const metricsQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "one-shot response",
          session_id: "sess-one-shot",
          num_turns: 4,
          duration_ms: 8000,
          duration_api_ms: 6500,
          total_cost_usd: 0.028,
          modelUsage: {
            "claude-opus-4-5": {
              inputTokens: 200,
              outputTokens: 100,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      metricsQueryFn,
    );

    // TC-004: all 4 metrics must be extracted from success result
    // These assertions will FAIL until implementation adds these fields to QueryOneShotResult
    expect(result.numTurns).toBe(4);
    expect(result.durationMs).toBe(8000);
    expect(result.durationApiMs).toBe(6500);
    expect(result.totalCostUsd).toBe(0.028);
  });

  it("leaves metrics as undefined when SDK result does not contain them", async () => {
    const noMetricsQueryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: "sess-no-metrics",
          // No num_turns, duration_ms, duration_api_ms, total_cost_usd
          modelUsage: {},
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      noMetricsQueryFn,
    );

    // Metrics absent in SDK result → should be undefined (not 0, not null)
    // This checks AC #5 for the one-shot path
    expect(result.numTurns).toBeUndefined();
    expect(result.durationMs).toBeUndefined();
    expect(result.durationApiMs).toBeUndefined();
    expect(result.totalCostUsd).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-020: one-shot の turnCount placeholder が numTurns に置き換えられている
// ---------------------------------------------------------------------------

describe("TC-020: turnCount placeholder is replaced by numTurns", () => {
  it("provides numTurns (not turnCount) when SDK returns num_turns", async () => {
    const queryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: "sess-turncount",
          num_turns: 5,
          duration_ms: 3000,
          duration_api_ms: 2000,
          total_cost_usd: 0.01,
          modelUsage: {},
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    // TC-020: numTurns is present with the value from SDK num_turns
    // FAILS until implementation adds numTurns to QueryOneShotResult
    expect(result.numTurns).toBe(5);

    // turnCount (the old placeholder) should NOT be present or should be absent
    // (it was "Reserved for future use" — this repurposing removes it)
    // The field should not exist in the result (implementation removes the placeholder)
    expect(Object.prototype.hasOwnProperty.call(result, "turnCount")).toBe(false);
  });

  it("numTurns is undefined when SDK result omits num_turns", async () => {
    const queryFn: QueryFn = vi.fn().mockImplementation(() => {
      return (async function* () {
        yield {
          type: "result",
          subtype: "success",
          result: "done",
          session_id: undefined,
          // No num_turns
          modelUsage: {},
        };
      })();
    }) as unknown as QueryFn;

    const result = await queryOneShot(
      { systemPrompt: "sys", prompt: "user" },
      makeConfig(),
      queryFn,
    );

    // numTurns absent → undefined
    expect(result.numTurns).toBeUndefined();

    // turnCount must not be present (the placeholder is removed)
    expect(Object.prototype.hasOwnProperty.call(result, "turnCount")).toBe(false);
  });
});
