/**
 * Unit tests for src/config/schema.ts — maxRetries validation.
 * TC-037: maxRetries=0 → CONFIG_INVALID error
 * TC-038: maxRetries=11 → CONFIG_INVALID error (should)
 */
import { describe, it, expect } from "vitest";
import { validateConfig } from "../../src/config/schema.js";

function makeMinimalRawConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    anthropic: { apiKey: "sk-test" },
    ...overrides,
  };
}

// TC-037: config schema — maxRetries=0 で CONFIG_INVALID エラー
describe("TC-037: validateConfig — maxRetries=0 throws CONFIG_INVALID", () => {
  it("throws with message containing 'CONFIG_INVALID' when maxRetries=0", () => {
    const raw = makeMinimalRawConfig({
      pipeline: { maxRetries: 0 },
    });

    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/pipeline\.maxRetries must be between 1 and 10/);
  });
});

// TC-038: config schema — maxRetries=11 で CONFIG_INVALID エラー (should)
describe("TC-038: validateConfig — maxRetries=11 throws CONFIG_INVALID", () => {
  it("throws with CONFIG_INVALID message when maxRetries=11", () => {
    const raw = makeMinimalRawConfig({
      pipeline: { maxRetries: 11 },
    });

    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

// TC-036: maxRetries 未設定時 — validateConfig は通る (validated via getMaxRetries defaults)
describe("TC-036 (schema): validateConfig — accepts config without pipeline field", () => {
  it("does not throw when pipeline is absent", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("does not throw when pipeline.maxRetries is a valid value (e.g., 3)", () => {
    const raw = makeMinimalRawConfig({ pipeline: { maxRetries: 3 } });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// Additional: boundary values
describe("validateConfig — maxRetries boundary values", () => {
  it("accepts maxRetries=1 (lower bound)", () => {
    const raw = makeMinimalRawConfig({ pipeline: { maxRetries: 1 } });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts maxRetries=10 (upper bound)", () => {
    const raw = makeMinimalRawConfig({ pipeline: { maxRetries: 10 } });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws when maxRetries is a non-integer float", () => {
    const raw = makeMinimalRawConfig({ pipeline: { maxRetries: 1.5 } });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});
