import { describe, it, expect } from "vitest";
import {
  BUILTIN_MODEL_REGISTRY,
  PROVIDER_DEFAULTS,
  mergeModelRegistry,
  resolveProvider,
} from "../../src/config/model-registry.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";
import { DesignStep } from "../../src/core/step/design.js";
import { SpecReviewStep } from "../../src/core/step/spec-review.js";
import { CodeReviewStep } from "../../src/core/step/code-review.js";
import { ConformanceStep } from "../../src/core/step/conformance.js";

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    ...overrides,
  };
}

describe("BUILTIN_MODEL_REGISTRY", () => {
  it("contains anthropic models", () => {
    expect(BUILTIN_MODEL_REGISTRY["claude-sonnet-4-5"]?.provider).toBe("anthropic");
    expect(BUILTIN_MODEL_REGISTRY["claude-opus-4-6"]?.provider).toBe("anthropic");
  });

  it("contains current openai models", () => {
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.4"]?.provider).toBe("openai");
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.5"]?.provider).toBe("openai");
  });

  it("contains newly added openai models", () => {
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.4-mini"]?.provider).toBe("openai");
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.3-codex-spark"]?.provider).toBe("openai");
  });

  it("does not contain deprecated openai models", () => {
    expect(BUILTIN_MODEL_REGISTRY["o3"]).toBeUndefined();
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.1"]).toBeUndefined();
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.2-codex"]).toBeUndefined();
    expect(BUILTIN_MODEL_REGISTRY["gpt-5.3-codex"]).toBeUndefined();
  });
});

describe("mergeModelRegistry", () => {
  it("with no user models → equals BUILTIN", () => {
    const config = makeConfig();
    const merged = mergeModelRegistry(config);
    expect(merged).toEqual(BUILTIN_MODEL_REGISTRY);
  });

  it("with user override → user entry wins", () => {
    const config = makeConfig({
      models: {
        "claude-sonnet-4-5": { provider: "openai" },
      },
    });
    const merged = mergeModelRegistry(config);
    expect(merged["claude-sonnet-4-5"]?.provider).toBe("openai");
  });

  it("with new model → merged contains both built-in and new", () => {
    const config = makeConfig({
      models: {
        "gpt-6-turbo": { provider: "openai" },
      },
    });
    const merged = mergeModelRegistry(config);
    expect(merged["gpt-6-turbo"]?.provider).toBe("openai");
    expect(merged["claude-sonnet-4-5"]?.provider).toBe("anthropic");
  });
});

describe("resolveProvider", () => {
  it("known anthropic model → 'anthropic'", () => {
    const merged = mergeModelRegistry(makeConfig());
    expect(resolveProvider("claude-sonnet-4-5", merged)).toBe("anthropic");
  });

  it("known openai model → 'openai'", () => {
    const merged = mergeModelRegistry(makeConfig());
    expect(resolveProvider("gpt-5.4", merged)).toBe("openai");
  });

  it("unknown model → throws code: 'CONFIG_INVALID'", () => {
    const merged = mergeModelRegistry(makeConfig());
    expect(() => resolveProvider("unknown-xyz", merged)).toThrow();
    try {
      resolveProvider("unknown-xyz", merged);
    } catch (err) {
      expect((err as { code?: string }).code).toBe("CONFIG_INVALID");
    }
  });
});

// TC-009: PROVIDER_DEFAULTS の各フィールド値を直接検証
// TC-007: PROVIDER_DEFAULTS.openai holds the successor models
describe("PROVIDER_DEFAULTS (TC-009 / TC-007)", () => {
  it("anthropic.defaultModel is claude-sonnet-5", () => {
    expect(PROVIDER_DEFAULTS.anthropic.defaultModel).toBe("claude-sonnet-5");
  });

  it("openai.defaultModel is gpt-5.6-luna", () => {
    expect(PROVIDER_DEFAULTS.openai.defaultModel).toBe("gpt-5.6-luna");
  });

  it("openai.designModel is gpt-5.6-sol", () => {
    expect(PROVIDER_DEFAULTS.openai.designModel).toBe("gpt-5.6-sol");
  });
});

// TC-010: anthropic に designModel が存在しないことを検証
describe("PROVIDER_DEFAULTS anthropic has no designModel (TC-010)", () => {
  it("anthropic.designModel is undefined", () => {
    expect(PROVIDER_DEFAULTS.anthropic.designModel).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-001: new anthropic models resolve to "anthropic"
// ---------------------------------------------------------------------------

describe("TC-001: new Claude 5 anthropic models resolve to 'anthropic'", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("claude-opus-5 resolves to 'anthropic'", () => {
    expect(resolveProvider("claude-opus-5", merged)).toBe("anthropic");
  });

  it("claude-sonnet-5 resolves to 'anthropic'", () => {
    expect(resolveProvider("claude-sonnet-5", merged)).toBe("anthropic");
  });

  it("claude-fable-5 resolves to 'anthropic'", () => {
    expect(resolveProvider("claude-fable-5", merged)).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// TC-002: new openai models resolve to "openai"
// ---------------------------------------------------------------------------

describe("TC-002: new GPT-5.6 openai models resolve to 'openai'", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("gpt-5.6-sol resolves to 'openai'", () => {
    expect(resolveProvider("gpt-5.6-sol", merged)).toBe("openai");
  });

  it("gpt-5.6-terra resolves to 'openai'", () => {
    expect(resolveProvider("gpt-5.6-terra", merged)).toBe("openai");
  });

  it("gpt-5.6-luna resolves to 'openai'", () => {
    expect(resolveProvider("gpt-5.6-luna", merged)).toBe("openai");
  });
});

// ---------------------------------------------------------------------------
// TC-003: existing models remain resolvable
// ---------------------------------------------------------------------------

describe("TC-003: existing models remain resolvable after update", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("gpt-5.4-mini still resolves to 'openai'", () => {
    expect(resolveProvider("gpt-5.4-mini", merged)).toBe("openai");
  });

  it("gpt-5.5 still resolves to 'openai'", () => {
    expect(resolveProvider("gpt-5.5", merged)).toBe("openai");
  });

  it("claude-sonnet-4-5 still resolves to 'anthropic'", () => {
    expect(resolveProvider("claude-sonnet-4-5", merged)).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// TC-010 (should): Claude 5 世代に [1m] SKU が追加されていない
// ---------------------------------------------------------------------------

describe("TC-010: Claude 5 models have no [1m] SKU in BUILTIN_MODEL_REGISTRY", () => {
  it("claude-opus-5[1m] is not in the registry", () => {
    expect(BUILTIN_MODEL_REGISTRY["claude-opus-5[1m]"]).toBeUndefined();
  });

  it("claude-sonnet-5[1m] is not in the registry", () => {
    expect(BUILTIN_MODEL_REGISTRY["claude-sonnet-5[1m]"]).toBeUndefined();
  });

  it("claude-fable-5[1m] is not in the registry", () => {
    expect(BUILTIN_MODEL_REGISTRY["claude-fable-5[1m]"]).toBeUndefined();
  });
});

describe("step default models resolve without CONFIG_INVALID (bare config)", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("DesignStep default model resolves to 'anthropic'", () => {
    expect(resolveProvider(DesignStep.agent.model, merged)).toBe("anthropic");
  });

  it("SpecReviewStep default model resolves to 'anthropic'", () => {
    expect(resolveProvider(SpecReviewStep.agent.model, merged)).toBe("anthropic");
  });

  it("CodeReviewStep default model resolves to 'anthropic'", () => {
    expect(resolveProvider(CodeReviewStep.agent.model, merged)).toBe("anthropic");
  });

  it("ConformanceStep default model resolves to 'anthropic'", () => {
    expect(resolveProvider(ConformanceStep.agent.model, merged)).toBe("anthropic");
  });

  it("README example model 'claude-opus-4-6[1m]' resolves to 'anthropic'", () => {
    expect(resolveProvider("claude-opus-4-6[1m]", merged)).toBe("anthropic");
  });

  it("existing env with user-defined 'claude-opus-4-6[1m]' keeps provider 'anthropic'", () => {
    const configWithUserEntry = makeConfig({
      models: { "claude-opus-4-6[1m]": { provider: "anthropic" } },
    });
    const mergedWithUser = mergeModelRegistry(configWithUserEntry);
    expect(resolveProvider("claude-opus-4-6[1m]", mergedWithUser)).toBe("anthropic");
  });
});
