/**
 * Unit tests for mapSessionUsage pure function.
 * No SDK mocks needed — pure function, table-driven.
 */
import { describe, it, expect } from "vitest";
import { mapSessionUsage } from "../../../../src/adapter/managed-agent/usage.js";
import type { BetaManagedAgentsSessionUsage } from "../../../../src/adapter/managed-agent/sdk/sessions.js";

describe("mapSessionUsage", () => {
  it("null input → undefined", () => {
    expect(mapSessionUsage(null)).toBeUndefined();
  });

  it("undefined input → undefined", () => {
    expect(mapSessionUsage(undefined)).toBeUndefined();
  });

  it("全フィールド present → 正しく変換", () => {
    const raw: BetaManagedAgentsSessionUsage = {
      input_tokens: 100,
      output_tokens: 200,
      cache_read_input_tokens: 50,
      cache_creation: {
        ephemeral_1h_input_tokens: 30,
        ephemeral_5m_input_tokens: 20,
      },
    };
    expect(mapSessionUsage(raw)).toEqual({
      inputTokens: 100,
      outputTokens: 200,
      cacheReadInputTokens: 50,
      cacheCreationInputTokens: 50, // 30 + 20
    });
  });

  it("全フィールド undefined (空オブジェクト) → 全 0 埋め", () => {
    const raw: BetaManagedAgentsSessionUsage = {};
    expect(mapSessionUsage(raw)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
  });

  it("cache_creation の片方だけ present → 合算 (ephemeral_1h のみ)", () => {
    const raw: BetaManagedAgentsSessionUsage = {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation: {
        ephemeral_1h_input_tokens: 40,
        // ephemeral_5m_input_tokens absent
      },
    };
    expect(mapSessionUsage(raw)).toEqual({
      inputTokens: 10,
      outputTokens: 20,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 40,
    });
  });

  it("cache_creation の片方だけ present → 合算 (ephemeral_5m のみ)", () => {
    const raw: BetaManagedAgentsSessionUsage = {
      cache_creation: {
        ephemeral_5m_input_tokens: 15,
      },
    };
    expect(mapSessionUsage(raw)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 15,
    });
  });

  it("cache_creation が undefined → cacheCreationInputTokens: 0", () => {
    const raw: BetaManagedAgentsSessionUsage = {
      input_tokens: 5,
      output_tokens: 8,
      cache_read_input_tokens: 2,
      // cache_creation absent
    };
    expect(mapSessionUsage(raw)).toEqual({
      inputTokens: 5,
      outputTokens: 8,
      cacheReadInputTokens: 2,
      cacheCreationInputTokens: 0,
    });
  });
});
