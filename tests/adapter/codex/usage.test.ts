import { describe, expect, it } from "vitest";
import { normalizeCodexUsage } from "../../../src/adapter/codex/usage.js";
import { computeCostUsd } from "../../../src/core/usage/pricing.js";

describe("Codex usage reference costs", () => {
  it("charges each input category once and does not add reasoning to output", () => {
    const usage = normalizeCodexUsage({
      input_tokens: 1000, cached_input_tokens: 600, cache_write_input_tokens: 200,
      output_tokens: 100, reasoning_output_tokens: 40,
    });
    expect(usage).toEqual({
      inputTokens: 200, cacheReadInputTokens: 600, cacheCreationInputTokens: 200,
      outputTokens: 100,
    });
    expect(computeCostUsd("gpt-5.6-sol", usage)).toBeCloseTo(0.00404, 10);
  });

  it("accepts absent cache fields from older SDK versions", () => {
    expect(normalizeCodexUsage({ input_tokens: 100, output_tokens: 10 })).toEqual({
      inputTokens: 100, outputTokens: 10, cacheReadInputTokens: 0, cacheCreationInputTokens: 0,
    });
  });

  it("prices the reported 29-row token fixture at $28.85 after category correction", () => {
    // A numeric regression fixture only: no historical usage files are migrated.
    // SDK cumulative scope and missing invocations remain outside this correction.
    const usage = normalizeCodexUsage({
      input_tokens: 36_200_054, cached_input_tokens: 33_116_032,
      cache_write_input_tokens: 0, output_tokens: 163_151,
    });
    const cost = computeCostUsd("gpt-5.6-sol", usage);
    expect(cost).toBeCloseTo(28.8455208, 7);
    expect(cost!.toFixed(2)).toBe("28.85");
  });
});
