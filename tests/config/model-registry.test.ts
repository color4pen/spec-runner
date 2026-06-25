import { describe, it, expect } from "vitest";
import {
  BUILTIN_MODEL_REGISTRY,
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
