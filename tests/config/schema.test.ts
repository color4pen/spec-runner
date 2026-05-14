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

// Models section validation
describe("validateConfig — models section", () => {
  it("accepts config without models field", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts valid models with anthropic provider", () => {
    const raw = makeMinimalRawConfig({
      models: { "my-model": { provider: "anthropic" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts valid models with openai provider", () => {
    const raw = makeMinimalRawConfig({
      models: { "my-oai-model": { provider: "openai" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws when models entry has invalid provider", () => {
    const raw = makeMinimalRawConfig({
      models: { "bad-model": { provider: "unknown" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/provider must be/);
  });

  it("throws when models entry is not an object", () => {
    const raw = makeMinimalRawConfig({
      models: { "bad-model": "not-an-object" },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

// Step model registry validation
describe("validateConfig — step model registry validation", () => {
  it("accepts step with known built-in anthropic model", () => {
    const raw = makeMinimalRawConfig({
      steps: { implementer: { model: "claude-sonnet-4-5" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws CONFIG_INVALID for step with unknown model name", () => {
    const raw = makeMinimalRawConfig({
      steps: { implementer: { model: "nonexistent-model-xyz" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/not in the model registry/);
  });

  it("accepts step with openai model in local runtime", () => {
    const raw = {
      version: 1,
      runtime: "local",
      anthropic: { apiKey: "" },
      steps: { implementer: { model: "o3" } },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws when managed runtime uses openai model", () => {
    const raw = makeMinimalRawConfig({
      steps: { implementer: { model: "o3" } },
    });
    // managed runtime (default)
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/cannot be used with runtime "managed"/);
  });

  it("accepts step with user-defined model added to models section", () => {
    const raw = makeMinimalRawConfig({
      models: { "my-custom-model": { provider: "anthropic" } },
      steps: { implementer: { model: "my-custom-model" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});
