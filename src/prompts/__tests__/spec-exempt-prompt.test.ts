/**
 * T-05: Spec-exempt marker guidance in downstream prompts.
 *
 * Verifies that:
 * - spec-review system prompt contains SPEC_EXEMPT_MARKER guidance (vacuously satisfied)
 * - conformance system prompt contains SPEC_EXEMPT_MARKER guidance (vacuously satisfied)
 * - design system prompt contains chore Completion Checklist branch
 * - SPEC_EXEMPT_MARKER is shared from a single source (not hardcoded in prompts)
 *
 * This test is the acceptance gate for requirement 4 (downstream does not error on exempt spec.md)
 * and the drift-prevention guard between the marker constant and prompt text.
 */
import { describe, it, expect } from "vitest";
import { SPEC_REVIEW_SYSTEM_PROMPT } from "../spec-review-system.js";
import { CONFORMANCE_SYSTEM_PROMPT } from "../conformance-system.js";
import { DESIGN_SYSTEM_PROMPT } from "../design-system.js";
import { SPEC_EXEMPT_MARKER } from "../../templates/step-output-templates.js";

// ---------------------------------------------------------------------------
// T-05: spec-review system prompt contains SPEC_EXEMPT_MARKER guidance
// ---------------------------------------------------------------------------

describe("T-05: SPEC_REVIEW_SYSTEM_PROMPT — spec-exempt guidance", () => {
  it("contains SPEC_EXEMPT_MARKER", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(SPEC_EXEMPT_MARKER);
  });

  it("instructs reviewer to treat exempt spec.md as vacuously satisfied", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("vacuously satisfied");
  });

  it("instructs reviewer not to flag Requirement absence as a finding for exempt types", () => {
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("findings: []");
  });

  it("does not drop existing semantic review guidance for non-exempt types", () => {
    // Ensure the existing spec.md review criteria are still present
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Requirement correctness");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Scenario coverage");
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain("Normative keywords");
  });
});

// ---------------------------------------------------------------------------
// T-05: conformance system prompt contains SPEC_EXEMPT_MARKER guidance
// ---------------------------------------------------------------------------

describe("T-05: CONFORMANCE_SYSTEM_PROMPT — spec-exempt guidance", () => {
  it("contains SPEC_EXEMPT_MARKER", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(SPEC_EXEMPT_MARKER);
  });

  it("instructs conformance reviewer to treat exempt spec.md as vacuously satisfied", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("vacuously satisfied");
  });

  it("instructs conformance reviewer not to flag Requirement absence as non-conformity", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("non-conformity");
  });

  it("still evaluates tasks.md and design.md conformance", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("tasks.md");
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("design.md");
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain("request.md");
  });
});

// ---------------------------------------------------------------------------
// T-05: design system prompt contains chore Completion Checklist branch
// ---------------------------------------------------------------------------

describe("T-05: DESIGN_SYSTEM_PROMPT — chore Completion Checklist branch", () => {
  it("contains chore Completion Checklist entry", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("type: chore");
  });

  it("chore branch references SPEC_EXEMPT_MARKER", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain(SPEC_EXEMPT_MARKER);
  });

  it("chore branch instructs agent to leave spec.md unchanged", () => {
    // Should tell the agent not to edit spec.md and not to invent Requirements
    expect(DESIGN_SYSTEM_PROMPT).toContain("Requirement を捏造しないこと");
  });

  it("existing spec-change / new-feature branch is still present", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("type: spec-change / new-feature");
  });

  it("existing bug-fix / refactoring branch is still present", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain("type: bug-fix / refactoring");
  });
});

// ---------------------------------------------------------------------------
// T-05: SPEC_EXEMPT_MARKER is shared from single source (drift prevention)
// ---------------------------------------------------------------------------

describe("T-05: SPEC_EXEMPT_MARKER single-source sharing", () => {
  it("SPEC_EXEMPT_MARKER is non-empty", () => {
    expect(SPEC_EXEMPT_MARKER.trim().length).toBeGreaterThan(0);
  });

  it("spec-review prompt references the actual SPEC_EXEMPT_MARKER value", () => {
    // The prompt must contain the literal marker string (imported constant)
    expect(SPEC_REVIEW_SYSTEM_PROMPT).toContain(SPEC_EXEMPT_MARKER);
  });

  it("conformance prompt references the actual SPEC_EXEMPT_MARKER value", () => {
    expect(CONFORMANCE_SYSTEM_PROMPT).toContain(SPEC_EXEMPT_MARKER);
  });

  it("design prompt references the actual SPEC_EXEMPT_MARKER value", () => {
    expect(DESIGN_SYSTEM_PROMPT).toContain(SPEC_EXEMPT_MARKER);
  });
});
