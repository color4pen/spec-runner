/**
 * Tests for alias registration in BUILTIN_MODEL_REGISTRY.
 *
 * TC-011: alias が静的検証と provider 解決を pass する
 * TC-012: ANTHROPIC_MODEL_ALIASES が 3 alias を含み export される
 * TC-013: alias が BUILTIN_MODEL_REGISTRY に anthropic として登録されている
 * TC-014: resolveProvider が 3 alias に対して anthropic を返す
 * TC-015: validateConfig が alias を含む config を CONFIG_INVALID を投げずに受理する
 */

import { describe, it, expect } from "vitest";
import {
  BUILTIN_MODEL_REGISTRY,
  ANTHROPIC_MODEL_ALIASES,
  mergeModelRegistry,
  resolveProvider,
} from "../../src/config/model-registry.js";
import { validateConfig } from "../../src/config/schema/validation.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-012: ANTHROPIC_MODEL_ALIASES が 3 alias を含み export される
// ---------------------------------------------------------------------------

describe("TC-012: ANTHROPIC_MODEL_ALIASES has 3 aliases and is exported", () => {
  it("exports ANTHROPIC_MODEL_ALIASES as a ReadonlySet", () => {
    expect(ANTHROPIC_MODEL_ALIASES).toBeDefined();
    expect(typeof ANTHROPIC_MODEL_ALIASES.has).toBe("function");
  });

  it("contains 'sonnet'", () => {
    expect(ANTHROPIC_MODEL_ALIASES.has("sonnet")).toBe(true);
  });

  it("contains 'opus'", () => {
    expect(ANTHROPIC_MODEL_ALIASES.has("opus")).toBe(true);
  });

  it("contains 'haiku'", () => {
    expect(ANTHROPIC_MODEL_ALIASES.has("haiku")).toBe(true);
  });

  it("has exactly 3 entries", () => {
    expect(ANTHROPIC_MODEL_ALIASES.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// TC-013: alias が BUILTIN_MODEL_REGISTRY に anthropic として登録されている
// ---------------------------------------------------------------------------

describe("TC-013: aliases are registered in BUILTIN_MODEL_REGISTRY as anthropic", () => {
  it("'sonnet' is in BUILTIN_MODEL_REGISTRY with provider 'anthropic'", () => {
    expect(BUILTIN_MODEL_REGISTRY["sonnet"]?.provider).toBe("anthropic");
  });

  it("'opus' is in BUILTIN_MODEL_REGISTRY with provider 'anthropic'", () => {
    expect(BUILTIN_MODEL_REGISTRY["opus"]?.provider).toBe("anthropic");
  });

  it("'haiku' is in BUILTIN_MODEL_REGISTRY with provider 'anthropic'", () => {
    expect(BUILTIN_MODEL_REGISTRY["haiku"]?.provider).toBe("anthropic");
  });

  it("default model 'claude-sonnet-5' is unchanged", () => {
    expect(BUILTIN_MODEL_REGISTRY["claude-sonnet-5"]?.provider).toBe("anthropic");
  });

  it("default model 'claude-opus-5' is unchanged", () => {
    expect(BUILTIN_MODEL_REGISTRY["claude-opus-5"]?.provider).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// TC-014: resolveProvider が 3 alias に対して anthropic を返す
// ---------------------------------------------------------------------------

describe("TC-014: resolveProvider returns 'anthropic' for all 3 aliases", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("resolveProvider('sonnet', merged) returns 'anthropic'", () => {
    expect(resolveProvider("sonnet", merged)).toBe("anthropic");
  });

  it("resolveProvider('opus', merged) returns 'anthropic'", () => {
    expect(resolveProvider("opus", merged)).toBe("anthropic");
  });

  it("resolveProvider('haiku', merged) returns 'anthropic'", () => {
    expect(resolveProvider("haiku", merged)).toBe("anthropic");
  });
});

// ---------------------------------------------------------------------------
// TC-015: validateConfig が alias を含む config を受理する
// ---------------------------------------------------------------------------

describe("TC-015: validateConfig accepts config with alias model names", () => {
  it("does not throw when steps.design.model = 'sonnet'", () => {
    expect(() =>
      validateConfig(
        makeConfig({
          steps: {
            design: { model: "sonnet" },
          },
        }),
      ),
    ).not.toThrow();
  });

  it("does not throw when byRequestType.new-feature.model = 'opus'", () => {
    expect(() =>
      validateConfig(
        makeConfig({
          steps: {
            design: {
              model: "sonnet",
              byRequestType: {
                "new-feature": { model: "opus" },
              },
            },
          },
        }),
      ),
    ).not.toThrow();
  });

  it("does not throw when steps.defaults.model = 'haiku'", () => {
    expect(() =>
      validateConfig(
        makeConfig({
          steps: {
            defaults: { model: "haiku" },
          },
        }),
      ),
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// TC-011: alias が静的検証と provider 解決を pass する (composite)
// ---------------------------------------------------------------------------

describe("TC-011: alias passes static validation and provider resolution", () => {
  const merged = mergeModelRegistry(makeConfig());

  it("'sonnet' resolves to anthropic and validates without error", () => {
    expect(resolveProvider("sonnet", merged)).toBe("anthropic");
    expect(() =>
      validateConfig(makeConfig({ steps: { implementer: { model: "sonnet" } } })),
    ).not.toThrow();
  });

  it("'opus' resolves to anthropic and validates without error", () => {
    expect(resolveProvider("opus", merged)).toBe("anthropic");
    expect(() =>
      validateConfig(makeConfig({ steps: { "code-review": { model: "opus" } } })),
    ).not.toThrow();
  });

  it("'haiku' resolves to anthropic and validates without error", () => {
    expect(resolveProvider("haiku", merged)).toBe("anthropic");
    expect(() =>
      validateConfig(makeConfig({ steps: { defaults: { model: "haiku" } } })),
    ).not.toThrow();
  });
});
