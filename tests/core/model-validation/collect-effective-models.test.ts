/**
 * Unit tests for src/core/model-validation/collect-effective-models.ts
 *
 * TC-001: custom reviewer と regression-gate の実効モデルが収集される
 * TC-002: config の byRequestType override が実効モデルに反映される
 * TC-003: CliStep は収集対象外
 * TC-004: provider 未登録モデルは provider が undefined になる
 */

import { describe, it, expect } from "vitest";
import {
  collectEffectiveModels,
  type EffectiveModelRef,
} from "../../../src/core/model-validation/collect-effective-models.js";
import type { PipelineDescriptor } from "../../../src/core/pipeline/types.js";
import type { SpecRunnerConfig } from "../../../src/config/schema.js";
import type { ModelsConfig } from "../../../src/config/model-registry.js";
import { BUILTIN_MODEL_REGISTRY, mergeModelRegistry } from "../../../src/config/model-registry.js";
import type { AgentStep, CliStep, Step } from "../../../src/core/port/step-types.js";
import { STANDARD_DESCRIPTOR } from "../../../src/core/pipeline/registry.js";
import { composeReviewerDescriptor } from "../../../src/core/pipeline/compose-reviewers.js";
import type { ReviewerSnapshot } from "../../../src/core/reviewers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(overrides: Partial<SpecRunnerConfig> = {}): SpecRunnerConfig {
  return { version: 1, runtime: "local", agents: {}, ...overrides };
}

/** Build a minimal AgentStep for testing. */
function makeAgentStep(name: string, model: string): AgentStep {
  return {
    kind: "agent",
    name,
    agent: {
      name: `specrunner-${name}`,
      role: name as import("../../../src/state/schema.js").AgentStepName,
      model,
      system: "",
      tools: [],
    },
    buildMessage: () => "",
    resultFilePath: () => null,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/** Build a minimal CliStep for testing. */
function makeCliStep(name: string): CliStep {
  return {
    kind: "cli",
    name,
    run: async () => {},
    resultFilePath: () => `${name}-result.md`,
    parseResult: () => ({ verdict: null, findingsPath: null }),
  };
}

/** Build a minimal PipelineDescriptor with given steps. */
function makeDescriptor(steps: readonly (readonly [string, Step])[]): PipelineDescriptor {
  return {
    ...STANDARD_DESCRIPTOR,
    steps,
    transitions: [],
    loopFixerPairs: {},
    loopNames: [],
    roles: {},
  };
}

// ---------------------------------------------------------------------------
// TC-001: custom reviewer と regression-gate の実効モデルが収集される
// ---------------------------------------------------------------------------

describe("TC-001: custom reviewer and regression-gate effective models are collected", () => {
  it("collects custom reviewer with snapshot.model set", () => {
    const snapshot: ReviewerSnapshot = {
      name: "my-reviewer",
      purpose: "test review",
      model: "claude-opus-5",
      maxIterations: 3,
      criteria: "",
      judgment: "",
      freeText: "",
    };
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, [snapshot]);
    const config = makeConfig();
    const merged = mergeModelRegistry(config);
    const refs = collectEffectiveModels(composed, config, undefined, merged);

    const reviewerRef = refs.find((r) => r.stepName === "my-reviewer");
    expect(reviewerRef).toBeDefined();
    expect(reviewerRef?.model).toBe("claude-opus-5");
    expect(reviewerRef?.provider).toBe("anthropic");
  });

  it("collects custom reviewer without snapshot.model (falls back to DEFAULT_REVIEW_MODEL)", () => {
    const snapshot: ReviewerSnapshot = {
      name: "no-model-reviewer",
      purpose: "test review",
      // model not set → falls back to DEFAULT_REVIEW_MODEL (claude-sonnet-5)
      maxIterations: 3,
      criteria: "",
      judgment: "",
      freeText: "",
    };
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, [snapshot]);
    const config = makeConfig();
    const merged = mergeModelRegistry(config);
    const refs = collectEffectiveModels(composed, config, undefined, merged);

    const reviewerRef = refs.find((r) => r.stepName === "no-model-reviewer");
    expect(reviewerRef).toBeDefined();
    expect(reviewerRef?.model).toBe("claude-sonnet-5");
    expect(reviewerRef?.provider).toBe("anthropic");
  });

  it("collects regression-gate with model claude-sonnet-5", () => {
    const snapshot: ReviewerSnapshot = {
      name: "my-reviewer",
      purpose: "test",
      model: "claude-opus-5",
      maxIterations: 3,
      criteria: "",
      judgment: "",
      freeText: "",
    };
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, [snapshot]);
    const config = makeConfig();
    const merged = mergeModelRegistry(config);
    const refs = collectEffectiveModels(composed, config, undefined, merged);

    const gateRef = refs.find((r) => r.stepName === "regression-gate");
    expect(gateRef).toBeDefined();
    expect(gateRef?.model).toBe("claude-sonnet-5");
    expect(gateRef?.provider).toBe("anthropic");
  });

  it("each ref has stepName and configPath fields", () => {
    const snapshot: ReviewerSnapshot = {
      name: "my-reviewer",
      purpose: "test",
      model: "claude-opus-5",
      maxIterations: 3,
      criteria: "",
      judgment: "",
      freeText: "",
    };
    const composed = composeReviewerDescriptor(STANDARD_DESCRIPTOR, [snapshot]);
    const config = makeConfig();
    const merged = mergeModelRegistry(config);
    const refs = collectEffectiveModels(composed, config, undefined, merged);

    const reviewerRef = refs.find((r) => r.stepName === "my-reviewer");
    expect(reviewerRef).toBeDefined();
    expect(typeof reviewerRef?.stepName).toBe("string");
    // configPath is null when from step definition (no config key)
    expect(reviewerRef?.configPath).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// TC-002: config の byRequestType override が実効モデルに反映される
// ---------------------------------------------------------------------------

describe("TC-002: config byRequestType override is reflected in effective model", () => {
  it("code-review byRequestType.new-feature.model override is applied", () => {
    const config = makeConfig({
      steps: {
        "code-review": {
          model: "claude-sonnet-5",
          byRequestType: {
            "new-feature": { model: "claude-opus-5" },
          },
        },
      },
    });
    const merged = mergeModelRegistry(config);
    const refs = collectEffectiveModels(STANDARD_DESCRIPTOR, config, "new-feature", merged);

    const codeReviewRef = refs.find((r) => r.stepName === "code-review");
    expect(codeReviewRef).toBeDefined();
    expect(codeReviewRef?.model).toBe("claude-opus-5");
    // configPath should point to the byRequestType key
    expect(codeReviewRef?.configPath).toBe("steps.code-review.byRequestType.new-feature.model");
  });

  it("code-review step-level override is applied when requestType doesn't match byRequestType", () => {
    const config = makeConfig({
      steps: {
        "code-review": {
          model: "claude-opus-5",
          byRequestType: {
            "new-feature": { model: "claude-sonnet-5" },
          },
        },
      },
    });
    const merged = mergeModelRegistry(config);
    const refs = collectEffectiveModels(STANDARD_DESCRIPTOR, config, "bug-fix", merged);

    const codeReviewRef = refs.find((r) => r.stepName === "code-review");
    expect(codeReviewRef).toBeDefined();
    expect(codeReviewRef?.model).toBe("claude-opus-5");
    expect(codeReviewRef?.configPath).toBe("steps.code-review.model");
  });
});

// ---------------------------------------------------------------------------
// TC-003: CliStep は収集対象外
// ---------------------------------------------------------------------------

describe("TC-003: CliStep entries are excluded from collection", () => {
  it("only agent steps are included in results", () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["agent-step-1", makeAgentStep("agent-step-1", "claude-sonnet-5")],
      ["cli-step-1", makeCliStep("cli-step-1")],
      ["agent-step-2", makeAgentStep("agent-step-2", "claude-opus-5")],
      ["cli-step-2", makeCliStep("cli-step-2")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;

    const refs = collectEffectiveModels(descriptor, config, undefined, merged);

    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.stepName)).toEqual(["agent-step-1", "agent-step-2"]);
    expect(refs.find((r) => r.stepName === "cli-step-1")).toBeUndefined();
    expect(refs.find((r) => r.stepName === "cli-step-2")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TC-004: provider 未登録モデルは provider が undefined になる
// ---------------------------------------------------------------------------

describe("TC-004: unregistered model has provider = undefined", () => {
  it("model not in merged registry → provider is undefined", () => {
    const unregisteredModel = "custom-model-xyz-9999";
    const steps: readonly (readonly [string, Step])[] = [
      ["custom-step", makeAgentStep("custom-step", unregisteredModel)],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY; // does not contain unregisteredModel

    const refs = collectEffectiveModels(descriptor, config, undefined, merged);

    expect(refs).toHaveLength(1);
    const ref = refs[0]!;
    expect(ref.stepName).toBe("custom-step");
    expect(ref.model).toBe(unregisteredModel);
    expect(ref.provider).toBeUndefined();
    // configPath should be null (from step definition, no config entry)
    expect(ref.configPath).toBeNull();
  });

  it("other fields are still correctly set for unregistered model", () => {
    const steps: readonly (readonly [string, Step])[] = [
      ["my-step", makeAgentStep("my-step", "unknown-model-abc")],
    ];
    const descriptor = makeDescriptor(steps);
    const config = makeConfig();
    const merged = BUILTIN_MODEL_REGISTRY;

    const refs = collectEffectiveModels(descriptor, config, undefined, merged);
    const ref = refs[0]!;

    expect(ref.stepName).toBe("my-step");
    expect(ref.model).toBe("unknown-model-abc");
    expect(ref.provider).toBeUndefined();
  });
});
