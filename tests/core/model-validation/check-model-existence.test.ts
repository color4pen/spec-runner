/**
 * Unit tests for src/core/model-validation/check-model-existence.ts
 *
 * TC-005: OpenAI モデルは一覧に無くても未知として扱われない
 * TC-006: alias は live 検証で実在扱いされる
 * TC-007: 腐った Anthropic model ID が invalid.unknown に含まれる
 * TC-008: result が unavailable のとき常に skipped を返す
 * TC-009: 全モデルが既知のとき ok を返す
 * TC-010: provider が undefined のモデルは照合対象外
 */

import { describe, it, expect } from "vitest";
import { checkModelExistence } from "../../../src/core/model-validation/check-model-existence.js";
import type { EffectiveModelRef } from "../../../src/core/model-validation/collect-effective-models.js";
import type { SupportedModelsResult } from "../../../src/core/port/model-listing.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRef(
  stepName: string,
  model: string,
  provider: "anthropic" | "openai" | undefined,
  configPath: string | null = null,
): EffectiveModelRef {
  return { stepName, model, provider, configPath };
}

// ---------------------------------------------------------------------------
// TC-005: OpenAI モデルは一覧に無くても未知として扱われない
// ---------------------------------------------------------------------------

describe("TC-005: OpenAI model is not treated as unknown even when absent from list", () => {
  it("openai model absent from listed result → outcome is ok (not invalid)", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("implementer", "gpt-4o", "openai"),
    ];
    const result: SupportedModelsResult = { kind: "listed", models: [] };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("openai model plus valid anthropic model → outcome is ok when anthropic is in list", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("implementer", "gpt-4o", "openai"),
      makeRef("code-review", "claude-sonnet-5", "anthropic"),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5", "claude-opus-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// TC-006: alias は live 検証で実在扱いされる
// ---------------------------------------------------------------------------

describe("TC-006: aliases are treated as valid in live validation", () => {
  it("'sonnet' alias with empty listed models → ok (alias skips list check)", () => {
    const refs: EffectiveModelRef[] = [makeRef("design", "sonnet", "anthropic")];
    const result: SupportedModelsResult = { kind: "listed", models: [] };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("'opus' alias with empty listed models → ok", () => {
    const refs: EffectiveModelRef[] = [makeRef("code-review", "opus", "anthropic")];
    const result: SupportedModelsResult = { kind: "listed", models: [] };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("'haiku' alias with empty listed models → ok", () => {
    const refs: EffectiveModelRef[] = [makeRef("implementer", "haiku", "anthropic")];
    const result: SupportedModelsResult = { kind: "listed", models: [] };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("all three aliases together with empty list → ok", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "sonnet", "anthropic"),
      makeRef("code-review", "opus", "anthropic"),
      makeRef("implementer", "haiku", "anthropic"),
    ];
    const result: SupportedModelsResult = { kind: "listed", models: [] };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// TC-007: 腐った Anthropic model ID が invalid.unknown に含まれる
// ---------------------------------------------------------------------------

describe("TC-007: stale Anthropic model ID is included in invalid.unknown", () => {
  it("defunct anthropic model not in list → invalid with the ref", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "claude-defunct-99", "anthropic", "steps.design.model"),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5", "claude-opus-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("invalid");
    if (outcome.kind === "invalid") {
      expect(outcome.unknown).toHaveLength(1);
      expect(outcome.unknown[0]!.stepName).toBe("design");
      expect(outcome.unknown[0]!.model).toBe("claude-defunct-99");
      expect(outcome.unknown[0]!.configPath).toBe("steps.design.model");
    }
  });

  it("two defunct models → both appear in invalid.unknown", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "claude-defunct-99", "anthropic", "steps.design.model"),
      makeRef("code-review", "claude-old-5", "anthropic", null),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("invalid");
    if (outcome.kind === "invalid") {
      expect(outcome.unknown).toHaveLength(2);
      const stepNames = outcome.unknown.map((r) => r.stepName);
      expect(stepNames).toContain("design");
      expect(stepNames).toContain("code-review");
    }
  });

  it("mix of valid and invalid anthropic models → only invalid ones in unknown", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "claude-sonnet-5", "anthropic"),
      makeRef("code-review", "claude-defunct-99", "anthropic", "steps.code-review.model"),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5", "claude-opus-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("invalid");
    if (outcome.kind === "invalid") {
      expect(outcome.unknown).toHaveLength(1);
      expect(outcome.unknown[0]!.stepName).toBe("code-review");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-008: result が unavailable のとき常に skipped を返す
// ---------------------------------------------------------------------------

describe("TC-008: unavailable result always returns skipped", () => {
  it("unavailable with any refs → skipped with reason", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "claude-sonnet-5", "anthropic"),
      makeRef("code-review", "claude-defunct-99", "anthropic"),
    ];
    const result: SupportedModelsResult = { kind: "unavailable", reason: "offline" };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") {
      expect(outcome.reason).toBe("offline");
    }
  });

  it("unavailable with empty refs → skipped", () => {
    const refs: EffectiveModelRef[] = [];
    const result: SupportedModelsResult = { kind: "unavailable", reason: "auth unavailable" };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") {
      expect(outcome.reason).toBe("auth unavailable");
    }
  });

  it("unavailable reason is preserved exactly", () => {
    const refs: EffectiveModelRef[] = [makeRef("design", "claude-defunct-99", "anthropic")];
    const result: SupportedModelsResult = { kind: "unavailable", reason: "Network unreachable" };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("skipped");
    if (outcome.kind === "skipped") {
      expect(outcome.reason).toBe("Network unreachable");
    }
  });
});

// ---------------------------------------------------------------------------
// TC-009: 全モデルが既知のとき ok を返す
// ---------------------------------------------------------------------------

describe("TC-009: ok is returned when all models are known", () => {
  it("single known anthropic model → ok", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "claude-sonnet-5", "anthropic"),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5", "claude-opus-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("multiple known anthropic models → ok", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("design", "claude-sonnet-5", "anthropic"),
      makeRef("code-review", "claude-opus-5", "anthropic"),
      makeRef("implementer", "claude-sonnet-5", "anthropic"),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5", "claude-opus-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("empty refs with listed result → ok", () => {
    const refs: EffectiveModelRef[] = [];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5"],
    };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// TC-010: provider が undefined のモデルは照合対象外
// ---------------------------------------------------------------------------

describe("TC-010: models with undefined provider are excluded from validation", () => {
  it("undefined provider model absent from listed result → not in invalid.unknown", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("custom-step", "custom-model-xyz-9999", undefined),
    ];
    const result: SupportedModelsResult = { kind: "listed", models: [] };

    const outcome = checkModelExistence(refs, result);
    expect(outcome.kind).toBe("ok");
  });

  it("undefined provider model is not validated even alongside anthropic model failures", () => {
    const refs: EffectiveModelRef[] = [
      makeRef("custom-step", "custom-model-xyz-9999", undefined),
      makeRef("design", "claude-sonnet-5", "anthropic"),
    ];
    const result: SupportedModelsResult = {
      kind: "listed",
      models: ["claude-sonnet-5"],
    };

    const outcome = checkModelExistence(refs, result);
    // custom-step's undefined provider model is excluded; design's claude-sonnet-5 is valid
    expect(outcome.kind).toBe("ok");
  });
});
