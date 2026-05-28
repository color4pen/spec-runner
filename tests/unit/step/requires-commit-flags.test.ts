/**
 * Regression guard: all writing-agent steps must have reportTool defined.
 *
 * reportTool replaces the former requiresCommit guard as the structural
 * completion signal. Steps that produce artifacts (design, spec-fixer,
 * implementer, etc.) must declare reportTool so the StepExecutor can detect
 * when an agent ends its turn without explicitly reporting completion.
 *
 * TC-RCF-01: SpecFixerStep.reportTool is defined
 * TC-RCF-02: ImplementerStep.reportTool is defined
 * TC-RCF-03: BuildFixerStep.reportTool is defined
 * TC-RCF-04: CodeFixerStep.reportTool is defined
 * TC-RCF-05: DesignStep.reportTool is defined
 * TC-RCF-06: SpecReviewStep.reportTool is defined
 * TC-RCF-07: CodeReviewStep.reportTool is defined
 * TC-RCF-08: reportTool.name is "report_result" for all steps
 */
import { describe, it, expect } from "vitest";
import { SpecFixerStep } from "../../../src/core/step/spec-fixer.js";
import { ImplementerStep } from "../../../src/core/step/implementer.js";
import { BuildFixerStep } from "../../../src/core/step/build-fixer.js";
import { CodeFixerStep } from "../../../src/core/step/code-fixer.js";
import { SpecReviewStep } from "../../../src/core/step/spec-review.js";
import { CodeReviewStep } from "../../../src/core/step/code-review.js";
import { DesignStep } from "../../../src/core/step/design.js";

describe("TC-RCF-01: SpecFixerStep.reportTool is defined", () => {
  it("SpecFixerStep has reportTool", () => {
    expect(SpecFixerStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-02: ImplementerStep.reportTool is defined", () => {
  it("ImplementerStep has reportTool", () => {
    expect(ImplementerStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-03: BuildFixerStep.reportTool is defined", () => {
  it("BuildFixerStep has reportTool", () => {
    expect(BuildFixerStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-04: CodeFixerStep.reportTool is defined", () => {
  it("CodeFixerStep has reportTool", () => {
    expect(CodeFixerStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-05: DesignStep.reportTool is defined", () => {
  it("DesignStep has reportTool", () => {
    expect(DesignStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-06: SpecReviewStep.reportTool is defined", () => {
  it("SpecReviewStep has reportTool", () => {
    expect(SpecReviewStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-07: CodeReviewStep.reportTool is defined", () => {
  it("CodeReviewStep has reportTool", () => {
    expect(CodeReviewStep.reportTool).toBeDefined();
  });
});

describe("TC-RCF-08: reportTool.name is 'report_result' for all steps", () => {
  const steps = [
    { name: "SpecFixerStep", step: SpecFixerStep },
    { name: "ImplementerStep", step: ImplementerStep },
    { name: "BuildFixerStep", step: BuildFixerStep },
    { name: "CodeFixerStep", step: CodeFixerStep },
    { name: "DesignStep", step: DesignStep },
    { name: "SpecReviewStep", step: SpecReviewStep },
    { name: "CodeReviewStep", step: CodeReviewStep },
  ];

  for (const { name, step } of steps) {
    it(`${name}.reportTool.name === "report_result"`, () => {
      expect(step.reportTool?.name).toBe("report_result");
    });
  }
});
