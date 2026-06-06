/**
 * Unit tests for src/core/usage/pricing.ts
 *
 * TC-011: 素の model key は normalizeModelKey で変換されない
 * TC-012: -YYYYMMDD を除去し [1m] は保持する（合成ケース）
 * TC-013: - + 8 桁数字以外の suffix は除去しない
 * TC-005: 4 種の token に対応する単価で合算する
 * TC-006: date suffix 付き key が解決される
 * TC-007: 1M-context variant は別 key として扱われる
 * TC-014: 登録済み model で computeCostUsd が非 null を返す
 * TC-015: token 数がすべて 0 のとき cost が 0 になる
 * TC-016: formatUsd(null) は "$?" を返す
 * TC-017: formatUsd(数値) は小数第4位の "$x.xxxx" 形式で返す
 * TC-018: formatUsd(0) は "$0.0000" を返す
 */
import { describe, it, expect } from "vitest";
import {
  normalizeModelKey,
  lookupPricing,
  computeCostUsd,
  formatUsd,
  MODEL_PRICING,
} from "../../../src/core/usage/pricing.js";
import type { ModelUsage } from "../../../src/core/port/model-usage.js";

// ---------------------------------------------------------------------------
// normalizeModelKey
// ---------------------------------------------------------------------------

describe("TC-011: normalizeModelKey — plain key is unchanged", () => {
  it("returns the key unchanged when there is no date or context suffix", () => {
    expect(normalizeModelKey("claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
  });
});

describe("TC-012: normalizeModelKey — removes -YYYYMMDD and keeps [1m]", () => {
  it("removes date suffix and preserves context-window suffix", () => {
    expect(normalizeModelKey("claude-opus-4-6[1m]-20251001")).toBe("claude-opus-4-6[1m]");
  });
});

describe("TC-013: normalizeModelKey — non-8-digit suffix is not removed", () => {
  it("leaves suffix intact when it is not exactly 8 digits", () => {
    expect(normalizeModelKey("claude-sonnet-4-6-draft")).toBe("claude-sonnet-4-6-draft");
  });
});

describe("normalizeModelKey — additional cases", () => {
  it("removes 8-digit date suffix from haiku key", () => {
    expect(normalizeModelKey("claude-haiku-4-5-20251001")).toBe("claude-haiku-4-5");
  });

  it("leaves plain opus key unchanged", () => {
    expect(normalizeModelKey("claude-opus-4-6")).toBe("claude-opus-4-6");
  });

  it("leaves [1m] key unchanged when no date suffix", () => {
    expect(normalizeModelKey("claude-opus-4-6[1m]")).toBe("claude-opus-4-6[1m]");
  });
});

// ---------------------------------------------------------------------------
// lookupPricing
// ---------------------------------------------------------------------------

describe("lookupPricing", () => {
  it("returns pricing for a known model", () => {
    const p = lookupPricing("claude-sonnet-4-6");
    expect(p).not.toBeNull();
    expect(p?.input).toBeGreaterThan(0);
  });

  it("resolves date-suffixed key via normalizeModelKey", () => {
    const p = lookupPricing("claude-haiku-4-5-20251001");
    expect(p).not.toBeNull();
    expect(p).toEqual(MODEL_PRICING["claude-haiku-4-5"]);
  });

  it("returns null for unknown model", () => {
    expect(lookupPricing("claude-unknown-model-xyz")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// computeCostUsd
// ---------------------------------------------------------------------------

describe("TC-005: computeCostUsd — 4-token cost formula", () => {
  it("sums all 4 token types with their per-MTok rates", () => {
    // Use claude-sonnet-4-6: input=$3, output=$15, cacheRead=$0.30, cacheWrite=$3.75
    const usage: ModelUsage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 1_000_000,
    };
    const cost = computeCostUsd("claude-sonnet-4-6", usage);
    // 3 + 15 + 0.30 + 3.75 = 22.05
    expect(cost).toBeCloseTo(22.05, 6);
  });

  it("computes correctly with fractional token counts", () => {
    const usage: ModelUsage = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // claude-haiku-4-5: input=$0.80, output=$4.00
    // cost = 0.5*0.80 + 0.2*4.00 = 0.40 + 0.80 = 1.20
    const cost = computeCostUsd("claude-haiku-4-5", usage);
    expect(cost).toBeCloseTo(1.20, 6);
  });
});

describe("TC-006: computeCostUsd — date suffix key is resolved", () => {
  it("returns non-null for haiku key with date suffix", () => {
    const usage: ModelUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    const cost = computeCostUsd("claude-haiku-4-5-20251001", usage);
    expect(cost).not.toBeNull();
    // Should match resolved haiku pricing
    const expected = computeCostUsd("claude-haiku-4-5", usage);
    expect(cost).toBeCloseTo(expected!, 10);
  });
});

describe("TC-007: computeCostUsd — [1m] and base are distinct keys", () => {
  it("opus[1m] and opus base use separate pricing entries", () => {
    // Both are in MODEL_PRICING — they currently have same rates but are distinct entries
    expect(MODEL_PRICING["claude-opus-4-6"]).toBeDefined();
    expect(MODEL_PRICING["claude-opus-4-6[1m]"]).toBeDefined();

    const usage: ModelUsage = {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    // Both resolved independently — no cross-contamination
    const costBase = computeCostUsd("claude-opus-4-6", usage);
    const cost1m = computeCostUsd("claude-opus-4-6[1m]", usage);
    expect(costBase).not.toBeNull();
    expect(cost1m).not.toBeNull();
  });

  it("normalizeModelKey does not strip [1m] suffix", () => {
    expect(normalizeModelKey("claude-opus-4-6[1m]")).toBe("claude-opus-4-6[1m]");
  });
});

describe("TC-014: computeCostUsd — known model returns non-null", () => {
  it("returns a number for a registered model with positive token counts", () => {
    const usage: ModelUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 100,
      cacheCreationInputTokens: 50,
    };
    const cost = computeCostUsd("claude-sonnet-4-6", usage);
    expect(cost).not.toBeNull();
    expect(typeof cost).toBe("number");
  });
});

describe("TC-015: computeCostUsd — all-zero tokens yields 0", () => {
  it("returns 0 when all token counts are 0", () => {
    const usage: ModelUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    expect(computeCostUsd("claude-sonnet-4-6", usage)).toBe(0);
  });
});

describe("computeCostUsd — unknown model returns null", () => {
  it("returns null for unregistered model", () => {
    const usage: ModelUsage = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    expect(computeCostUsd("gpt-99-turbo", usage)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// formatUsd
// ---------------------------------------------------------------------------

describe("TC-016: formatUsd(null) returns '$?'", () => {
  it("returns '$?' for null input", () => {
    expect(formatUsd(null)).toBe("$?");
  });
});

describe("TC-017: formatUsd(number) returns 4-decimal '$x.xxxx' format", () => {
  it("formats 0.00123456 as '$0.0012'", () => {
    expect(formatUsd(0.00123456)).toBe("$0.0012");
  });
});

describe("TC-018: formatUsd(0) returns '$0.0000'", () => {
  it("formats zero as '$0.0000'", () => {
    expect(formatUsd(0)).toBe("$0.0000");
  });
});

describe("formatUsd — additional cases", () => {
  it("formats a larger value with 4 decimal places", () => {
    expect(formatUsd(22.05)).toBe("$22.0500");
  });

  it("rounds to 4 decimal places (toFixed semantics)", () => {
    // 1.23456789 → toFixed(4) = "1.2346"
    expect(formatUsd(1.23456789)).toBe("$1.2346");
  });
});
