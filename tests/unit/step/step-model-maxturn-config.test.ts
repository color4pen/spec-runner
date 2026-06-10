/**
 * Unit tests for step model / maxTurns configuration (propose-openspec-cli-and-step-model-config)
 *
 * TC-001: AgentStep interface に maxTurns フィールドが存在する (must)
 * TC-004: design step の model が claude-opus-4-6[1m]、judge step が claude-sonnet-4-6 に設定されている (must)
 * TC-005: 実装/修正 step の model が claude-sonnet-4-6 に設定されている (must)
 * TC-006: 各 step の maxTurns が設計値と一致する (must)
 */
import { describe, it, expect } from "vitest";
import { DesignStep } from "../../../src/core/step/design.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { BuildFixerStep } from "../../../src/core/step/build-fixer.js";
import { CodeReviewStep } from "../../../src/core/step/code-review.js";
import { CodeFixerStep } from "../../../src/core/step/code-fixer.js";
import type { AgentStep } from "../../../src/core/step/types.js";

// TC-001: AgentStep interface に maxTurns フィールドが存在する
describe("TC-001: AgentStep interface has maxTurns optional field", () => {
  it("DesignStep.maxTurns is a number (maxTurns field exists on AgentStep)", () => {
    // TypeScript structural type check via runtime inspection
    // The fact that this compiles proves maxTurns? exists in the AgentStep interface
    const step: AgentStep = DesignStep;
    expect(typeof step.maxTurns === "number" || step.maxTurns === undefined).toBe(true);
  });

  it("maxTurns field is accessible without TypeScript error on any AgentStep", () => {
    const steps: AgentStep[] = [
      DesignStep, SpecReviewStep, SpecFixerStep,
      ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep,
    ];
    // Accessing .maxTurns on all steps compiles without error (field exists in interface)
    for (const step of steps) {
      expect(typeof step.maxTurns === "number" || step.maxTurns === undefined).toBe(true);
    }
  });
});

// TC-004: design step の model が claude-opus-4-6[1m] に設定されている
describe("TC-004: Design step uses claude-opus-4-6[1m] model (opusplan pattern)", () => {
  it("DESIGN_AGENT_MODEL is claude-opus-4-6[1m]", () => {
    expect(DesignStep.agent.model).toBe("claude-opus-4-6[1m]");
  });

  it("SPEC_REVIEW_AGENT_MODEL is claude-sonnet-4-6", () => {
    expect(SpecReviewStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("CODE_REVIEW_AGENT_MODEL is claude-sonnet-4-6", () => {
    expect(CodeReviewStep.agent.model).toBe("claude-sonnet-4-6");
  });
});

// TC-005: 実装/修正 step の model が claude-sonnet-4-6 に設定されている
describe("TC-005: Implementation/fixer steps use claude-sonnet-4-6 model (opusplan pattern)", () => {
  it("SPEC_FIXER_AGENT_MODEL is claude-sonnet-4-6", () => {
    expect(SpecFixerStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("IMPLEMENTER_AGENT_MODEL is claude-sonnet-4-6", () => {
    expect(ImplementerStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("BUILD_FIXER_AGENT_MODEL is claude-sonnet-4-6", () => {
    expect(BuildFixerStep.agent.model).toBe("claude-sonnet-4-6");
  });

  it("CODE_FIXER_AGENT_MODEL is claude-sonnet-4-6", () => {
    expect(CodeFixerStep.agent.model).toBe("claude-sonnet-4-6");
  });
});

// TC-006: 各 step の maxTurns が設計値と一致する
describe("TC-006: Per-step maxTurns values match design specification", () => {
  it("DesignStep.maxTurns === 15", () => {
    expect(DesignStep.maxTurns).toBe(15); // design uses 15 maxTurns
  });

  it("SpecReviewStep.maxTurns === 15", () => {
    expect(SpecReviewStep.maxTurns).toBe(15);
  });

  it("SpecFixerStep.maxTurns === 25", () => {
    expect(SpecFixerStep.maxTurns).toBe(25);
  });

  it("ImplementerStep.maxTurns === 60", () => {
    expect(ImplementerStep.maxTurns).toBe(60);
  });

  it("BuildFixerStep.maxTurns === 35", () => {
    expect(BuildFixerStep.maxTurns).toBe(35);
  });

  it("CodeReviewStep.maxTurns === 20", () => {
    expect(CodeReviewStep.maxTurns).toBe(20);
  });

  it("CodeFixerStep.maxTurns === 30", () => {
    expect(CodeFixerStep.maxTurns).toBe(30);
  });
});
