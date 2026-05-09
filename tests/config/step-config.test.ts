/**
 * Unit tests for src/config/step-config.ts — getStepExecutionConfig()
 *
 * TC-001: step-level config が最優先で解決される
 * TC-002: step-level 未設定時に defaults が使われる
 * TC-003: config defaults 未設定時に stepDefaults が使われる
 * TC-004: maxTurns の解決順序が model と独立して動作する
 * TC-005: maxTurns: null が unlimited として扱われる（stepDefaults の 30 に fallback しない）
 * TC-009: steps: {} でも後方互換が維持される
 * TC-018: step-level の maxTurns: null が defaults の数値より優先される
 * TC-019: 存在しない step 名を指定しても defaults にフォールバックする
 *
 * validateConfig steps validation:
 * TC-013: maxTurns: 0 → CONFIG_INVALID
 * TC-014: maxTurns: -1 → CONFIG_INVALID
 * TC-015: model: "" → CONFIG_INVALID
 * TC-016r: timeoutMs: 0 → 有効値として通過する（タイムアウト無効）
 * TC-020: timeoutMs: -1 → CONFIG_INVALID
 * TC-021: step 固有の timeoutMs: 0 → 有効値として通過する
 * TC-022: step 固有の timeoutMs: -5 → CONFIG_INVALID
 * TC-023: maxTurns: "unlimited" (string) → CONFIG_INVALID
 * TC-024: getStepExecutionConfig — timeoutMs: 0 が 0 のまま解決される
 * TC-025: getStepExecutionConfig — step 固有 timeoutMs: 0 が defaults の正数より優先される
 * TC-030: validateConfig — timeoutMs エラーメッセージに "non-negative" が含まれる
 * TC-031: validateConfig — timeoutMs: 1 は下限として有効
 *
 * TC-017: timeoutMs が解決されるが SDK options に含まれない (ResolvedStepConfig に含まれる)
 */
import { describe, it, expect } from "vitest";
import { getStepExecutionConfig } from "../../src/config/step-config.js";
import { validateConfig } from "../../src/config/schema.js";
import type { SpecRunnerConfig } from "../../src/config/schema.js";

function makeBaseConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return {
    version: 1,
    runtime: "local",
    anthropic: { apiKey: "" },
    agents: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-001: step-level config が最優先で解決される
// ---------------------------------------------------------------------------

describe("TC-001: step-level config は defaults より優先される", () => {
  it("steps.implementer.model が steps.defaults.model より優先される", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
        implementer: { model: "claude-opus-4" },
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.model).toBe("claude-opus-4");
  });
});

// ---------------------------------------------------------------------------
// TC-002: step-level 未設定時に defaults が使われる
// ---------------------------------------------------------------------------

describe("TC-002: step-level 未設定時に defaults が使われる", () => {
  it("steps.implementer が未設定なら steps.defaults.model が使われる", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
        // implementer は未設定
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.model).toBe("claude-sonnet-4-6");
  });
});

// ---------------------------------------------------------------------------
// TC-003: config defaults 未設定時に stepDefaults が使われる
// ---------------------------------------------------------------------------

describe("TC-003: config.steps が未定義なら stepDefaults が使われる", () => {
  it("config.steps 未定義 → stepDefaults.model が使われる", () => {
    const config = makeBaseConfig();
    // steps フィールドなし

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.model).toBe("claude-haiku-3");
    expect(resolved.maxTurns).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// TC-004: maxTurns の解決順序が model と独立して動作する
// ---------------------------------------------------------------------------

describe("TC-004: maxTurns と model はフィールドごとに独立して解決される", () => {
  it("implementer.maxTurns=90 と defaults.model は独立して解決される", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { model: "claude-sonnet-4-6" },
        implementer: { maxTurns: 90 },
        // implementer.model は未設定 → defaults.model から解決
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.maxTurns).toBe(90);
    expect(resolved.model).toBe("claude-sonnet-4-6");
  });
});

// ---------------------------------------------------------------------------
// TC-005: maxTurns: null が unlimited として扱われる（stepDefaults の 30 に fallback しない）
// ---------------------------------------------------------------------------

describe("TC-005: maxTurns: null は unlimited（stepDefaults にフォールバックしない）", () => {
  it("defaults.maxTurns: null → resolved.maxTurns は null（stepDefaults の 30 ではない）", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { maxTurns: null },
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.maxTurns).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-009: steps: {} （空オブジェクト）でも後方互換が維持される
// ---------------------------------------------------------------------------

describe("TC-009: steps: {} でも stepDefaults にフォールバックする", () => {
  it("steps が空オブジェクトなら stepDefaults の値が使われる", () => {
    const config = makeBaseConfig({
      steps: {},
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.model).toBe("claude-haiku-3");
    expect(resolved.maxTurns).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// TC-017: timeoutMs が解決されるが SDK options には含まれない (ResolvedStepConfig に含まれる)
// ---------------------------------------------------------------------------

describe("TC-017: timeoutMs は ResolvedStepConfig に含まれる", () => {
  it("defaults.timeoutMs: 30000 → resolved.timeoutMs は 30000", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { timeoutMs: 30000 },
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
    });

    expect(resolved.timeoutMs).toBe(30000);
  });

  it("timeoutMs が未設定なら null（no timeout）", () => {
    const config = makeBaseConfig();

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
    });

    expect(resolved.timeoutMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-018: step-level の maxTurns: null が defaults の数値より優先される
// ---------------------------------------------------------------------------

describe("TC-018: step-level の maxTurns: null が defaults の数値より優先される", () => {
  it("implementer.maxTurns: null → defaults の 30 に fallback しない", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { maxTurns: 30 },
        implementer: { maxTurns: null },
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
      maxTurns: 60,
    });

    expect(resolved.maxTurns).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-019: 存在しない step 名を指定しても defaults にフォールバックする
// ---------------------------------------------------------------------------

describe("TC-019: 存在しない step 名でも defaults にフォールバックする", () => {
  it("nonexistent-step は defaults.maxTurns: 45 にフォールバックし、エラーが発生しない", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { maxTurns: 45 },
      },
    });

    const resolved = getStepExecutionConfig(config, "nonexistent-step", {
      model: "claude-haiku-3",
      maxTurns: 30,
    });

    expect(resolved.maxTurns).toBe(45);
  });
});

// ---------------------------------------------------------------------------
// validateConfig steps validation tests
// TC-013: maxTurns: 0 → CONFIG_INVALID
// TC-014: maxTurns: -1 → CONFIG_INVALID
// TC-015: model: "" → CONFIG_INVALID
// TC-016: timeoutMs: 0 → CONFIG_INVALID
// TC-023: maxTurns: "unlimited" (string) → CONFIG_INVALID
// ---------------------------------------------------------------------------

function makeMinimalRawConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    version: 1,
    runtime: "local",
    anthropic: { apiKey: "" },
    ...overrides,
  };
}

describe("TC-013: validateConfig — steps.defaults.maxTurns: 0 は CONFIG_INVALID", () => {
  it("maxTurns: 0 でバリデーションエラーが返される", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { maxTurns: 0 } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

describe("TC-014: validateConfig — steps.implementer.maxTurns: -1 は CONFIG_INVALID", () => {
  it("maxTurns: -1 でバリデーションエラーが返される", () => {
    const raw = makeMinimalRawConfig({
      steps: { implementer: { maxTurns: -1 } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

describe("TC-015: validateConfig — steps.defaults.model: '' は CONFIG_INVALID", () => {
  it("model: '' でバリデーションエラーが返される", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { model: "" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

describe("TC-016r: validateConfig — steps.defaults.timeoutMs: 0 は有効値として通過する", () => {
  it("timeoutMs: 0 でバリデーションエラーが発生しない（タイムアウト無効）", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { timeoutMs: 0 } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-020: validateConfig — steps.defaults.timeoutMs: -1 は CONFIG_INVALID", () => {
  it("timeoutMs: -1 でバリデーションエラーが返される", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { timeoutMs: -1 } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

describe("TC-021: validateConfig — steps.implementer.timeoutMs: 0 は有効値として通過する", () => {
  it("step 固有の timeoutMs: 0 でバリデーションエラーが発生しない", () => {
    const raw = makeMinimalRawConfig({
      steps: { implementer: { timeoutMs: 0 } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("TC-022: validateConfig — steps.implementer.timeoutMs: -5 は CONFIG_INVALID", () => {
  it("step 固有の timeoutMs: -5 でバリデーションエラーが返される", () => {
    const raw = makeMinimalRawConfig({
      steps: { implementer: { timeoutMs: -5 } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

describe("TC-023: validateConfig — steps.defaults.maxTurns: 'unlimited' は CONFIG_INVALID", () => {
  it("maxTurns に文字列を指定するとバリデーションエラーが返される", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { maxTurns: "unlimited" } },
    });
    expect(() => validateConfig(raw)).toThrow(/CONFIG_INVALID/);
  });
});

// ---------------------------------------------------------------------------
// TC-024: getStepExecutionConfig — timeoutMs: 0 が 0 のまま解決される
// ---------------------------------------------------------------------------

describe("TC-024: getStepExecutionConfig — defaults.timeoutMs: 0 が 0 として解決される", () => {
  it("resolved.timeoutMs === 0 (null や DEFAULT にならない)", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { timeoutMs: 0 },
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
    });

    expect(resolved.timeoutMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-025: getStepExecutionConfig — step 固有 timeoutMs: 0 が defaults の正数より優先される
// ---------------------------------------------------------------------------

describe("TC-025: getStepExecutionConfig — step 固有 timeoutMs: 0 が defaults の正数より優先される", () => {
  it("resolved.timeoutMs === 0 (defaults の 600000 に fallback しない)", () => {
    const config = makeBaseConfig({
      steps: {
        defaults: { timeoutMs: 600000 },
        implementer: { timeoutMs: 0 },
      },
    });

    const resolved = getStepExecutionConfig(config, "implementer", {
      model: "claude-haiku-3",
    });

    expect(resolved.timeoutMs).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TC-030: validateConfig — timeoutMs エラーメッセージに "non-negative" が含まれる
// ---------------------------------------------------------------------------

describe("TC-030: validateConfig — timeoutMs: -1 のエラーメッセージに non-negative が含まれる", () => {
  it("エラーメッセージに 'non-negative' が含まれる", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { timeoutMs: -1 } },
    });
    expect(() => validateConfig(raw)).toThrow(/non-negative/);
  });
});

// ---------------------------------------------------------------------------
// TC-031: validateConfig — timeoutMs: 1 は下限として有効
// ---------------------------------------------------------------------------

describe("TC-031: validateConfig — steps.defaults.timeoutMs: 1 は下限として有効", () => {
  it("timeoutMs: 1 でバリデーションエラーが発生しない", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { timeoutMs: 1 } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });
});

describe("validateConfig steps — 有効な値はエラーなし", () => {
  it("steps.defaults.maxTurns: null はエラーなし", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { maxTurns: null } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("steps.defaults.maxTurns: 1 はエラーなし（下限）", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { maxTurns: 1 } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("steps.defaults.model: 'claude-sonnet-4-6' はエラーなし", () => {
    const raw = makeMinimalRawConfig({
      steps: { defaults: { model: "claude-sonnet-4-6" } },
    });
    expect(() => validateConfig(raw)).not.toThrow();
  });

  it("steps フィールドが未設定でもエラーなし", () => {
    const raw = makeMinimalRawConfig();
    expect(() => validateConfig(raw)).not.toThrow();
  });
});
