/**
 * Unit tests for src/prompts/spec-review-system.ts
 *
 * TC-015 (add-spec-review-baseline-check): system prompt contains MODIFIED consistency check instruction
 * TC-016 (add-spec-review-baseline-check): system prompt contains REMOVED consistency check instruction
 * TC-017 (add-spec-review-baseline-check): system prompt contains ADDED consistency check instruction
 * TC-003 (add-spec-review-baseline-check): AgentStep interface has optional enrichContext method
 * TC-NEW-001 (spec-review-baseline-pull-model): system prompt instructs agent to use Read tool for baseline
 */
import { describe, it, expect } from "vitest";
import {
  SPEC_REVIEW_SYSTEM_PROMPT,
  SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE,
  buildSpecReviewInitialMessage,
} from "../../src/prompts/spec-review-system.js";
import { SpecReviewStep } from "../../src/core/step/spec-review.js";
import type { AgentStep } from "../../src/core/step/types.js";
import type { DynamicContext } from "../../src/git/dynamic-context.js";

// ---------------------------------------------------------------------------
// TC-003: AgentStep interface has optional enrichContext
// ---------------------------------------------------------------------------
describe("TC-003: AgentStep interface has optional enrichContext", () => {
  it("SpecReviewStep.enrichContext is defined as a function", () => {
    expect(typeof SpecReviewStep.enrichContext).toBe("function");
  });

  it("enrichContext signature accepts dynamicContext, cwd, slug and returns Promise<DynamicContext>", async () => {
    // This test verifies the method is callable with the expected signature.
    // We use a temp directory that has no specs/ subdirectory, so it returns dynamicContext as-is.
    const dynamicContext: DynamicContext = { gitLog: "log", diffStat: "stat", changesList: [], specIndex: [] };
    const result = await SpecReviewStep.enrichContext!(dynamicContext, "/nonexistent-cwd", "test-slug");
    expect(result).toEqual(dynamicContext);
  });
});

// ---------------------------------------------------------------------------
// TC-015: system prompt contains semantic review of spec.md
// ---------------------------------------------------------------------------
describe("TC-015: spec-review system prompt contains Semantic Review of spec.md", () => {
  it("mentions Semantic Review of spec.md", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Semantic Review of spec.md");
  });

  it("mentions normative keywords SHALL/MUST", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("SHALL");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("MUST");
  });

  it("mentions Layer-1 focus check", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Layer-1");
  });
});

// ---------------------------------------------------------------------------
// TC-016: system prompt contains Scenario coverage check
// ---------------------------------------------------------------------------
describe("TC-016: spec-review system prompt contains Scenario coverage check", () => {
  it("mentions Scenario coverage", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Scenario");
  });

  it("mentions Given/When/Then format", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/Given\/When\/Then|Given.*When.*Then/);
  });
});

// ---------------------------------------------------------------------------
// TC-017: system prompt contains completeness check
// ---------------------------------------------------------------------------
describe("TC-017: spec-review system prompt contains completeness check", () => {
  it("mentions completeness", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("completeness");
  });
});

// ---------------------------------------------------------------------------
// TC-010: SpecReviewStep.enrichContext returns dynamicContext unchanged
// ---------------------------------------------------------------------------
describe("TC-010: SpecReviewStep.enrichContext returns dynamicContext unchanged when specs/ absent", () => {
  it("returns the original dynamicContext when the specs directory does not exist", async () => {
    const dynamicContext: DynamicContext = {
      gitLog: "abc",
      diffStat: "def",
      changesList: ["some-change"],
      specIndex: [],
    };

    // Using a cwd path where specrunner/changes/test-slug/specs/ does not exist
    const result = await SpecReviewStep.enrichContext!(dynamicContext, "/nonexistent-path-xyz", "test-slug");

    expect(result).toEqual(dynamicContext);
  });
});

// ---------------------------------------------------------------------------
// Spec Presence Check — prompt keyword tests
// ---------------------------------------------------------------------------
describe("Spec Presence Check: system prompt contains presence check instructions", () => {
  it("contains 'Spec Presence Check' section header", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Spec Presence Check");
  });

  it("mentions spec-change and new-feature as types requiring spec.md", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("spec-change");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("new-feature");
  });

  it("specifies HIGH severity for missing spec.md", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("HIGH");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("spec.md");
  });

  it("instructs to skip check for bug-fix and refactoring types", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("bug-fix");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("refactoring");
  });
});

// ---------------------------------------------------------------------------
// Structural check: SpecReviewStep satisfies AgentStep interface with enrichContext
// ---------------------------------------------------------------------------
describe("AgentStep interface compliance with enrichContext", () => {
  it("SpecReviewStep satisfies AgentStep with enrichContext as optional method", () => {
    // Type assignment — if this compiles, the interface is satisfied
    const step: AgentStep = SpecReviewStep;
    expect(step.kind).toBe("agent");
    expect(step.name).toBe("spec-review");
    expect(typeof step.enrichContext).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-NEW-001: system prompt instructs agent to use Read tool for templates
// ---------------------------------------------------------------------------
describe("TC-NEW-001: system prompt instructs agent to use Read tool for template", () => {
  it("system prompt contains 'Read tool' instruction", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Read tool");
  });

  it("does NOT contain 'skip this check entirely'", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).not.toContain("skip this check entirely");
  });

  it("initial message template does not contain {{BASELINE_SPECS}} placeholder", () => {
    expect(SPEC_REVIEW_INITIAL_MESSAGE_TEMPLATE).not.toContain("{{BASELINE_SPECS}}");
  });

  it("buildSpecReviewInitialMessage output does not contain <baseline-specs>", () => {
    const message = buildSpecReviewInitialMessage({
      slug: "test-slug",
      requestType: "spec-change",
    });
    expect(message).not.toContain("<baseline-specs>");
  });
});
