/**
 * Unit tests for src/config/merge.ts — deepMergeConfig()
 *
 * Covers:
 * - Nested object merge (objects are recursively merged, not replaced)
 * - Primitive override (overlay primitive beats base)
 * - null override (null in overlay overwrites base value)
 * - undefined skip (undefined in overlay keeps base value)
 * - steps overlay (partial steps override inherits unspecified steps from base)
 */
import { describe, it, expect } from "vitest";
import { deepMergeConfig } from "../../src/config/merge.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";

function makeBase(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    agents: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Nested object merge
// ---------------------------------------------------------------------------

describe("deepMergeConfig — nested object merge", () => {
  it("merges steps objects recursively (does not replace steps wholesale)", () => {
    const base = makeBase({
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
        implementer: { model: "claude-opus-4", maxTurns: 40 },
      },
    });
    const overlay: Partial<SpecRunnerConfig> = {
      steps: {
        "code-review": { model: "claude-sonnet-4-6" },
      },
    };

    const merged = deepMergeConfig(base, overlay);

    // Both original step and new step are present
    expect(merged.steps?.["implementer"]?.model).toBe("claude-opus-4");
    expect(merged.steps?.["implementer"]?.maxTurns).toBe(40);
    expect(merged.steps?.["code-review"]?.model).toBe("claude-sonnet-4-6");
    expect(merged.steps?.defaults?.model).toBe("claude-sonnet-4-6");
  });

  it("overlays a specific step's model without affecting other step fields", () => {
    const base = makeBase({
      steps: {
        implementer: { model: "claude-sonnet-4-6", maxTurns: 30 },
      },
    });
    const overlay: Partial<SpecRunnerConfig> = {
      steps: {
        implementer: { model: "claude-opus-4-6[1m]" },
      },
    };

    const merged = deepMergeConfig(base, overlay);

    expect(merged.steps?.["implementer"]?.model).toBe("claude-opus-4-6[1m]");
    // maxTurns from base is preserved
    expect(merged.steps?.["implementer"]?.maxTurns).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// Primitive override
// ---------------------------------------------------------------------------

describe("deepMergeConfig — primitive override", () => {
  it("overlay runtime overrides base runtime", () => {
    const base = makeBase({ runtime: "local" });
    const overlay: Partial<SpecRunnerConfig> = { runtime: "managed" };

    const merged = deepMergeConfig(base, overlay);
    expect(merged.runtime).toBe("managed");
  });

  it("overlay version is applied (though callers should not change it)", () => {
    const base = makeBase();
    const overlay: Partial<SpecRunnerConfig> = { version: 1 };

    const merged = deepMergeConfig(base, overlay);
    expect(merged.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// null override
// ---------------------------------------------------------------------------

describe("deepMergeConfig — null override", () => {
  it("null in overlay for a primitive field overwrites base value", () => {
    const base = makeBase({
      steps: {
        implementer: { maxTurns: 30 },
      },
    });
    // TypeScript allows null here because we use Partial<SpecRunnerConfig>
    // In practice, maxTurns: null means "unlimited"
    const overlay = {
      steps: {
        implementer: { maxTurns: null as number | null },
      },
    } as Partial<SpecRunnerConfig>;

    const merged = deepMergeConfig(base, overlay);
    expect(merged.steps?.["implementer"]?.maxTurns).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// array replacement (TC-13)
// ---------------------------------------------------------------------------

describe("deepMergeConfig — array replacement", () => {
  it("overlay array completely replaces base array (no concat)", () => {
    // SpecRunnerConfig has no top-level array fields, so we exercise the
    // deepMergeObjects path via a type cast.  The merge rule is:
    //   array in overlay → overlay wins (replaces, does not concat).
    const base = {
      version: 1 as const,
      runtime: "local" as const,
      agents: {},
      // inject a synthetic array field to exercise the array-replace branch
      _testArray: ["model-a", "model-b"],
    } as unknown as ReturnType<typeof makeBase>;

    const overlay = {
      _testArray: ["model-c"],
    } as unknown as Parameters<typeof deepMergeConfig>[1];

    const merged = deepMergeConfig(base, overlay) as unknown as {
      _testArray: string[];
    };

    // Array is fully replaced, not concatenated
    expect(merged._testArray).toEqual(["model-c"]);
  });
});

// ---------------------------------------------------------------------------
// undefined skip
// ---------------------------------------------------------------------------

describe("deepMergeConfig — undefined skip (base wins)", () => {
  it("undefined steps in overlay does not wipe out base steps", () => {
    const base = makeBase({
      steps: { implementer: { model: "claude-sonnet-4-6" } },
    });
    // steps not present in overlay
    const overlay: Partial<SpecRunnerConfig> = { runtime: "managed" };

    const merged = deepMergeConfig(base, overlay);
    expect(merged.steps?.["implementer"]?.model).toBe("claude-sonnet-4-6");
  });
});

// ---------------------------------------------------------------------------
// steps overlay — full scenario
// ---------------------------------------------------------------------------

describe("deepMergeConfig — steps overlay full scenario", () => {
  it("project local with only code-review override inherits all other steps from user global", () => {
    const base = makeBase({
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
        design: { model: "claude-opus-4-6[1m]", maxTurns: 50 },
        implementer: { maxTurns: 30 },
        "code-review": { model: "claude-sonnet-4-6" },
      },
    });

    // Project local only overrides code-review for spec-change
    const overlay: Partial<SpecRunnerConfig> = {
      steps: {
        "code-review": {
          byRequestType: {
            "spec-change": { model: "claude-opus-4-6[1m]" },
          },
        },
      },
    };

    const merged = deepMergeConfig(base, overlay);

    // design and implementer from user global are preserved
    expect(merged.steps?.["design"]?.model).toBe("claude-opus-4-6[1m]");
    expect(merged.steps?.["design"]?.maxTurns).toBe(50);
    expect(merged.steps?.["implementer"]?.maxTurns).toBe(30);

    // code-review: existing model from user global + byRequestType from overlay
    expect(merged.steps?.["code-review"]?.model).toBe("claude-sonnet-4-6");
    expect(merged.steps?.["code-review"]?.byRequestType?.["spec-change"]?.model).toBe("claude-opus-4-6[1m]");
  });

  it("base only — returns base unchanged when overlay is empty", () => {
    const base = makeBase({
      steps: { defaults: { model: "claude-sonnet-4-6" } },
    });

    const merged = deepMergeConfig(base, {});
    expect(merged.steps?.defaults?.model).toBe("claude-sonnet-4-6");
  });

  it("overlay only top-level field (pipeline) without touching steps", () => {
    const base = makeBase({
      pipeline: { maxRetries: 2 },
      steps: { defaults: { model: "claude-sonnet-4-6" } },
    });
    const overlay: Partial<SpecRunnerConfig> = {
      pipeline: { maxRetries: 5 },
    };

    const merged = deepMergeConfig(base, overlay);
    expect(merged.pipeline?.maxRetries).toBe(5);
    expect(merged.steps?.defaults?.model).toBe("claude-sonnet-4-6");
  });
});
