/**
 * Tests for resolveTransientRetryConfig and transientRetry zod validation.
 *
 * T-02 acceptance criteria:
 *   - resolveTransientRetryConfig({}) returns { maxRetries: 3, baseDelayMs: 1000 }
 *   - resolveTransientRetryConfig({ transientRetry: { maxRetries: 0 } }).maxRetries === 0
 *   - transientRetry.maxRetries: -1 is rejected (CONFIG_INVALID)
 *   - Existing configs without transientRetry remain valid
 */
import { describe, it, expect } from "vitest";
import {
  resolveTransientRetryConfig,
  DEFAULT_TRANSIENT_RETRY_MAX,
  DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS,
  validateConfig,
} from "../schema.js";
import type { SpecRunnerConfig } from "../schema.js";

function makeMinimalConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return { version: 1, agents: {}, ...overrides };
}

// ---------------------------------------------------------------------------
// resolveTransientRetryConfig
// ---------------------------------------------------------------------------

describe("resolveTransientRetryConfig", () => {
  it("returns defaults when transientRetry is absent", () => {
    const result = resolveTransientRetryConfig(makeMinimalConfig());
    expect(result).toEqual({
      maxRetries: DEFAULT_TRANSIENT_RETRY_MAX,
      baseDelayMs: DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS,
    });
  });

  it("defaults: maxRetries=3, baseDelayMs=1000 (T-02 AC1)", () => {
    const result = resolveTransientRetryConfig(makeMinimalConfig());
    expect(result.maxRetries).toBe(3);
    expect(result.baseDelayMs).toBe(1000);
  });

  it("maxRetries: 0 disables feature (T-02 AC2)", () => {
    const result = resolveTransientRetryConfig(
      makeMinimalConfig({ transientRetry: { maxRetries: 0 } }),
    );
    expect(result.maxRetries).toBe(0);
    expect(result.baseDelayMs).toBe(DEFAULT_TRANSIENT_RETRY_BASE_DELAY_MS);
  });

  it("custom maxRetries is respected", () => {
    const result = resolveTransientRetryConfig(
      makeMinimalConfig({ transientRetry: { maxRetries: 5 } }),
    );
    expect(result.maxRetries).toBe(5);
  });

  it("custom baseDelayMs is respected", () => {
    const result = resolveTransientRetryConfig(
      makeMinimalConfig({ transientRetry: { baseDelayMs: 500 } }),
    );
    expect(result.baseDelayMs).toBe(500);
  });

  it("both fields override defaults", () => {
    const result = resolveTransientRetryConfig(
      makeMinimalConfig({ transientRetry: { maxRetries: 2, baseDelayMs: 200 } }),
    );
    expect(result).toEqual({ maxRetries: 2, baseDelayMs: 200 });
  });
});

// ---------------------------------------------------------------------------
// zod validation via validateConfig
// ---------------------------------------------------------------------------

describe("validateConfig — transientRetry schema", () => {
  it("config without transientRetry is valid (T-02 AC4)", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {} }),
    ).not.toThrow();
  });

  it("transientRetry with valid maxRetries is valid", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: { maxRetries: 3 } }),
    ).not.toThrow();
  });

  it("transientRetry with maxRetries: 0 is valid", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: { maxRetries: 0 } }),
    ).not.toThrow();
  });

  it("transientRetry with valid baseDelayMs is valid", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: { baseDelayMs: 500 } }),
    ).not.toThrow();
  });

  it("transientRetry.maxRetries: -1 is rejected with CONFIG_INVALID (T-02 AC3)", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: { maxRetries: -1 } }),
    ).toThrow(/CONFIG_INVALID/);
  });

  it("transientRetry.baseDelayMs: -1 is rejected with CONFIG_INVALID", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: { baseDelayMs: -1 } }),
    ).toThrow(/CONFIG_INVALID/);
  });

  it("transientRetry.maxRetries as non-integer is rejected", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: { maxRetries: 1.5 } }),
    ).toThrow(/CONFIG_INVALID/);
  });

  it("transientRetry as non-object is rejected", () => {
    expect(() =>
      validateConfig({ version: 1, agents: {}, transientRetry: "3" }),
    ).toThrow(/CONFIG_INVALID/);
  });
});
