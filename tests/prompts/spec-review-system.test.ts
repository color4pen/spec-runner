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
// TC-015: system prompt contains MODIFIED consistency check instruction
// ---------------------------------------------------------------------------
describe("TC-015: spec-review system prompt contains MODIFIED requirement check", () => {
  it("mentions MODIFIED requirements and HIGH severity + consistency category", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("MODIFIED");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("HIGH");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("consistency");
  });

  it("states MODIFIED requirements must exist in baseline", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/MODIFIED.*exist.*baseline|MODIFIED.*baseline.*exist/s);
  });
});

// ---------------------------------------------------------------------------
// TC-016: system prompt contains REMOVED consistency check instruction
// ---------------------------------------------------------------------------
describe("TC-016: spec-review system prompt contains REMOVED requirement check", () => {
  it("mentions REMOVED requirements", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("REMOVED");
  });

  it("states REMOVED requirements must exist in baseline", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/REMOVED.*exist.*baseline|REMOVED.*baseline.*exist/s);
  });
});

// ---------------------------------------------------------------------------
// TC-017: system prompt contains ADDED consistency check instruction
// ---------------------------------------------------------------------------
describe("TC-017: spec-review system prompt contains ADDED requirement check", () => {
  it("mentions ADDED requirements", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("ADDED");
  });

  it("states ADDED requirements must NOT already exist in baseline", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/ADDED.*NOT.*exist|ADDED.*must not.*exist/is);
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
// Delta Spec Presence Check — prompt keyword tests
// ---------------------------------------------------------------------------
describe("Delta Spec Presence Check: system prompt contains presence check instructions", () => {
  it("contains 'Delta Spec Presence Check' section header", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Delta Spec Presence Check");
  });

  it("mentions spec-change and new-feature as types requiring delta specs", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("spec-change");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("new-feature");
  });

  it("specifies HIGH severity for missing delta specs", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/specs\/.*directory.*empty.*missing.*HIGH/s);
  });

  it("instructs to skip check for bug-fix and refactoring types", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("bug-fix");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("refactoring");
  });

  it("mentions this check is independent of dsv", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toMatch(/independent.*dsv|dsv.*independent/is);
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
// TC-NEW-001: Read-tool-pull model — system prompt instructs agent to Read baseline
// ---------------------------------------------------------------------------
describe("TC-NEW-001: Read-tool-pull model: system prompt instructs agent to use Read tool", () => {
  it("system prompt contains 'Read tool' instruction", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Read tool");
  });

  it("contains 'Identify the capability name' step", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Identify the capability name");
  });

  it("contains 'Read `specrunner/specs/' instruction", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Read `specrunner/specs/");
  });

  it("contains 'Extract existing' instruction", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Extract existing");
  });

  it("contains 'category: consistency' keyword", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("category: consistency");
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
