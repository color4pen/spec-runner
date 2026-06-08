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
      steps: { implementer: { model: "o3" } },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws when managed runtime uses openai model", () => {
    const raw = {
      version: 1,
      runtime: "managed",
      steps: { implementer: { model: "o3" } },
    };
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

// ---------------------------------------------------------------------------
// agents validation
// ---------------------------------------------------------------------------

describe("validateConfig — agents validation", () => {
  it("throws when agents is not an object (string)", () => {
    const raw = makeMinimalRawConfig({ agents: "x" });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/agents must be an object/);
  });

  it("throws when an agent entry is not an object (string)", () => {
    const raw = makeMinimalRawConfig({ agents: { design: "x" } });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/agents\.design must be an object/);
  });

  it("throws when agentId is missing (undefined → not string)", () => {
    const raw = makeMinimalRawConfig({
      agents: { design: { definitionHash: "h", lastSyncedAt: "2026-01-01T00:00:00.000Z" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/agents\.design\.agentId must be a string/);
  });

  it("throws when definitionHash is not a string", () => {
    const raw = makeMinimalRawConfig({
      agents: { design: { agentId: "a", definitionHash: 123 as unknown as string, lastSyncedAt: "2026-01-01T00:00:00.000Z" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/agents\.design\.definitionHash must be a string/);
  });

  it("throws when lastSyncedAt is not a string", () => {
    const raw = makeMinimalRawConfig({
      agents: { design: { agentId: "a", definitionHash: "h", lastSyncedAt: null as unknown as string } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/agents\.design\.lastSyncedAt must be a string/);
  });

  it("accepts a valid agent entry", () => {
    const raw = makeMinimalRawConfig({
      agents: { design: { agentId: "a", definitionHash: "h", lastSyncedAt: "2026-01-01T00:00:00.000Z" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts empty agents object", () => {
    const raw = makeMinimalRawConfig({ agents: {} });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts agents with null entry (Partial Record)", () => {
    const raw = makeMinimalRawConfig({ agents: { design: null } });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts config without agents field", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// environment validation
// ---------------------------------------------------------------------------

describe("validateConfig — environment validation", () => {
  it("throws when environment is not an object (string)", () => {
    const raw = makeMinimalRawConfig({ environment: "bad" });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/environment must be an object/);
  });

  it("throws when id is not a string (number)", () => {
    const raw = makeMinimalRawConfig({
      environment: { id: 123 as unknown as string, lastSyncedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/environment\.id must be a string/);
  });

  it("throws when lastSyncedAt is not a string", () => {
    const raw = makeMinimalRawConfig({
      environment: { id: "env-1", lastSyncedAt: 0 as unknown as string },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/environment\.lastSyncedAt must be a string/);
  });

  it("accepts a valid environment", () => {
    const raw = makeMinimalRawConfig({
      environment: { id: "e", lastSyncedAt: "2026-01-01T00:00:00.000Z" },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts config without environment field", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// specReview.pollIntervalMs validation
// ---------------------------------------------------------------------------

describe("validateConfig — specReview.pollIntervalMs validation", () => {
  it("throws when pollIntervalMs is 0", () => {
    const raw = makeMinimalRawConfig({ specReview: { pollIntervalMs: 0 } });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/specReview\.pollIntervalMs must be a positive integer/);
  });

  it("throws when pollIntervalMs is negative", () => {
    const raw = makeMinimalRawConfig({ specReview: { pollIntervalMs: -1 } });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws when pollIntervalMs is a non-integer float", () => {
    const raw = makeMinimalRawConfig({ specReview: { pollIntervalMs: 1.5 } });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws when pollIntervalMs is a string", () => {
    const raw = makeMinimalRawConfig({ specReview: { pollIntervalMs: "10000" as unknown as number } });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws when specReview is not an object", () => {
    const raw = makeMinimalRawConfig({ specReview: "fast" as unknown });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/specReview must be an object/);
  });

  it("accepts pollIntervalMs=10000 (valid positive integer)", () => {
    const raw = makeMinimalRawConfig({ specReview: { pollIntervalMs: 10000 } });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts specReview without pollIntervalMs", () => {
    const raw = makeMinimalRawConfig({ specReview: {} });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts config without specReview field", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// pipeline type guard validation
// ---------------------------------------------------------------------------

describe("validateConfig — pipeline type guard", () => {
  it("throws when pipeline is a string (non-object)", () => {
    const raw = makeMinimalRawConfig({ pipeline: "fast" as unknown });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/pipeline must be an object/);
  });

  it("throws when pipeline is a number", () => {
    const raw = makeMinimalRawConfig({ pipeline: 42 as unknown });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/pipeline must be an object/);
  });
});

// ---------------------------------------------------------------------------
// byRequestType validation
// ---------------------------------------------------------------------------

describe("validateConfig — byRequestType validation", () => {
  it("accepts step with valid byRequestType config", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          model: "claude-sonnet-4-5",
          byRequestType: {
            "spec-change": { model: "claude-sonnet-4-5" },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws CONFIG_INVALID when byRequestType key is empty string", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          byRequestType: {
            "": { model: "claude-sonnet-4-5" },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/empty string key/);
  });

  it("throws CONFIG_INVALID when byRequestType entry model is empty string (with path in message)", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          byRequestType: {
            "spec-change": { model: "" },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/code-review.*byRequestType.*spec-change.*model/);
  });

  it("throws CONFIG_INVALID when byRequestType entry model is not a string (TC-26)", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          byRequestType: {
            "spec-change": { model: 123 as unknown as string },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/code-review.*byRequestType.*spec-change.*model/);
  });

  it("throws CONFIG_INVALID for nested byRequestType (1-level limit)", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          byRequestType: {
            "spec-change": {
              model: "claude-sonnet-4-5",
              byRequestType: { "nested": { model: "claude-sonnet-4-5" } },
            },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/1-level limit/);
  });

  it("throws CONFIG_INVALID when byRequestType entry has invalid maxTurns", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        implementer: {
          byRequestType: {
            "bug-fix": { maxTurns: 0 },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/implementer.*byRequestType.*bug-fix.*maxTurns/);
  });

  it("throws CONFIG_INVALID when byRequestType entry has invalid timeoutMs", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        implementer: {
          byRequestType: {
            "bug-fix": { timeoutMs: -1 },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/implementer.*byRequestType.*bug-fix.*timeoutMs/);
  });

  it("unknown type key passes with no error (warning only)", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          byRequestType: {
            "unknown-custom-type": { model: "claude-sonnet-4-5" },
          },
        },
      },
    });
    // Should not throw — unknown keys emit a warning but are not rejected
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws CONFIG_INVALID when byRequestType entry model is not in registry", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        "code-review": {
          byRequestType: {
            "spec-change": { model: "nonexistent-model-xyz" },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/not in the model registry/);
  });

  it("throws CONFIG_INVALID when managed runtime uses openai model in byRequestType", () => {
    const raw = {
      version: 1,
      runtime: "managed",
      steps: {
        implementer: {
          byRequestType: {
            "bug-fix": { model: "o3" },
          },
        },
      },
    };
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/cannot be used with runtime "managed"/);
  });

  it("accepts byRequestType with null maxTurns (unlimited)", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        implementer: {
          byRequestType: {
            "bug-fix": { maxTurns: null },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("accepts byRequestType with null timeoutMs (no timeout)", () => {
    const raw = makeMinimalRawConfig({
      steps: {
        implementer: {
          byRequestType: {
            "spec-change": { timeoutMs: null },
          },
        },
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});
