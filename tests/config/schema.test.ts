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
      steps: { implementer: { model: "gpt-5.4" } },
    };
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("throws when managed runtime uses openai model", () => {
    const raw = {
      version: 1,
      runtime: "managed",
      steps: { implementer: { model: "gpt-5.4" } },
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
            "bug-fix": { model: "gpt-5.4" },
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

// ---------------------------------------------------------------------------
// tests.placement validation (T-05 / TC-001 – TC-005, TC-011, TC-012, TC-013)
// ---------------------------------------------------------------------------

import { DEFAULT_TEST_SUFFIX } from "../../src/config/schema.js";

// TC-013: DEFAULT_TEST_SUFFIX が ".test.ts" としてエクスポートされる
describe("TC-013: DEFAULT_TEST_SUFFIX export", () => {
  it('DEFAULT_TEST_SUFFIX is ".test.ts"', () => {
    expect(DEFAULT_TEST_SUFFIX).toBe(".test.ts");
  });
});

// TC-005: absent tests section stays valid
describe("TC-005: validateConfig — absent tests section is valid", () => {
  it("does not throw when tests field is absent", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("does not throw when tests field is present but placement is absent", () => {
    const raw = makeMinimalRawConfig({ tests: {} });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// TC-001: valid sibling placement loads
describe("TC-001: validateConfig — valid sibling placement", () => {
  it("accepts { style: 'sibling' } without suffix", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "sibling" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
    const cfg = validateConfig(raw);
    expect(cfg.tests?.placement?.style).toBe("sibling");
  });

  it("accepts { style: 'sibling', suffix: '.spec.ts' }", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "sibling", suffix: ".spec.ts" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
    const cfg = validateConfig(raw);
    expect(cfg.tests?.placement?.style).toBe("sibling");
  });
});

// TC-002: valid mirror placement loads
describe("TC-002: validateConfig — valid mirror placement", () => {
  it("accepts { style: 'mirror', testsRoot: 'tests' }", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "mirror", testsRoot: "tests" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
    const cfg = validateConfig(raw);
    expect(cfg.tests?.placement?.style).toBe("mirror");
    if (cfg.tests?.placement?.style === "mirror") {
      expect(cfg.tests.placement.testsRoot).toBe("tests");
    }
  });

  it("accepts { style: 'mirror', testsRoot: 'tests', sourceRoot: 'src' }", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "mirror", testsRoot: "tests", sourceRoot: "src" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
    const cfg = validateConfig(raw);
    if (cfg.tests?.placement?.style === "mirror") {
      expect(cfg.tests.placement.testsRoot).toBe("tests");
      expect(cfg.tests.placement.sourceRoot).toBe("src");
    }
  });

  it("accepts mirror with suffix override", () => {
    const raw = makeMinimalRawConfig({
      tests: {
        placement: { style: "mirror", testsRoot: "tests", sourceRoot: "src", suffix: ".spec.ts" },
      },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

// TC-003: unknown style is rejected at load
describe("TC-003: validateConfig — unknown style is rejected", () => {
  it("throws CONFIG_INVALID for unknown style 'colocated'", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "colocated" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/tests\.placement/);
  });

  it("throws CONFIG_INVALID for unknown style 'flat'", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "flat" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/tests\.placement/);
  });
});

// TC-004: mirror without testsRoot is rejected at load
describe("TC-004: validateConfig — mirror without testsRoot is rejected", () => {
  it("throws CONFIG_INVALID when style is 'mirror' but testsRoot is absent", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "mirror" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/tests\.placement/);
  });
});

// TC-011: mirror の testsRoot が空文字のとき schema 検証エラーになる
describe("TC-011: validateConfig — mirror with empty testsRoot is rejected", () => {
  it("throws CONFIG_INVALID when testsRoot is empty string", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "mirror", testsRoot: "" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/tests\.placement/);
  });
});

// TC-012: suffix が空文字のとき schema 検証エラーになる
describe("TC-012: validateConfig — empty suffix is rejected", () => {
  it("throws CONFIG_INVALID when suffix is empty string (sibling)", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "sibling", suffix: "" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/tests\.placement/);
  });

  it("throws CONFIG_INVALID when suffix is empty string (mirror)", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "mirror", testsRoot: "tests", suffix: "" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
    expect(() => validateConfig(raw)).toThrow(/tests\.placement/);
  });
});

// Additional: type mismatch for testsRoot
describe("validateConfig — tests.placement type mismatch", () => {
  it("throws CONFIG_INVALID when testsRoot is a number", () => {
    const raw = makeMinimalRawConfig({
      tests: { placement: { style: "mirror", testsRoot: 42 } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });

  it("throws CONFIG_INVALID when tests is not an object", () => {
    const raw = makeMinimalRawConfig({ tests: "invalid" });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});
