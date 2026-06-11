/**
 * T-13: code-fixer reads active reviewer; findings block contains reviewer name.
 *
 * Tests for:
 * - resolveReviewerResultPath dispatch (code-review vs custom)
 * - fixer-helpers: buildFindingsBlock includes reviewer name
 * - code-fixer buildMessage: uses active reviewer, zero-reviewer fallback
 */
import { describe, it, expect } from "vitest";
import {
  buildFindingsBlock,
  buildContinuationMessage,
} from "../fixer-helpers.js";
import { resolveReviewerResultPath, reviewFeedbackPath, customReviewerResultPath } from "../../../util/paths.js";
import type { Finding } from "../../../kernel/report-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(severity: Finding["severity"] = "high"): Finding {
  return {
    severity,
    resolution: "fixable",
    file: "src/foo.ts",
    line: 42,
    title: "Test finding",
    rationale: "Should be fixed",
  };
}

// ---------------------------------------------------------------------------
// resolveReviewerResultPath dispatch
// ---------------------------------------------------------------------------

describe("resolveReviewerResultPath — dispatch", () => {
  it("dispatches 'code-review' to reviewFeedbackPath", () => {
    expect(resolveReviewerResultPath("slug", "code-review", 1)).toBe(
      reviewFeedbackPath("slug", 1),
    );
  });

  it("dispatches custom reviewer name to customReviewerResultPath", () => {
    expect(resolveReviewerResultPath("slug", "security", 2)).toBe(
      customReviewerResultPath("slug", "security", 2),
    );
  });

  it("zero reviewers: code-review path matches reviewFeedbackPath", () => {
    const path = resolveReviewerResultPath("s", "code-review", 1);
    expect(path).toContain("review-feedback");
  });
});

// ---------------------------------------------------------------------------
// buildFindingsBlock — reviewer name in output
// ---------------------------------------------------------------------------

describe("buildFindingsBlock — reviewerName", () => {
  it("header contains reviewer name when provided", () => {
    const block = buildFindingsBlock([makeFinding()], "security");
    expect(block).toContain("security");
  });

  it("source label uses generic 'review' when no reviewer name", () => {
    const block = buildFindingsBlock([makeFinding()]);
    expect(block).toContain("Findings from review");
  });

  it("each finding has a Source line with reviewer name", () => {
    const block = buildFindingsBlock([makeFinding()], "security");
    expect(block).toContain("**Source**: security review");
  });

  it("contains finding title", () => {
    const block = buildFindingsBlock([makeFinding()], "security");
    expect(block).toContain("Test finding");
  });

  it("contains finding severity", () => {
    const block = buildFindingsBlock([makeFinding("critical")], "security");
    expect(block).toContain("CRITICAL");
  });

  it("contains file path", () => {
    const block = buildFindingsBlock([makeFinding()]);
    expect(block).toContain("src/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// buildContinuationMessage — reviewer name source label
// ---------------------------------------------------------------------------

describe("buildContinuationMessage — reviewerName", () => {
  it("identifies code-fixer source as 'verification' for build-fixer step", () => {
    const msg = buildContinuationMessage({
      stepName: "build-fixer",
      findingsPath: "specrunner/changes/s/verification-result.md",
      slug: "s",
    });
    expect(msg).toContain("verification");
  });

  it("identifies source with reviewer name for code-fixer step", () => {
    const msg = buildContinuationMessage({
      stepName: "code-fixer",
      findingsPath: "specrunner/changes/s/security-result-001.md",
      slug: "s",
      reviewerName: "security",
    });
    expect(msg).toContain("security reviewer");
  });

  it("uses generic 'reviewer' when no reviewer name for code-fixer", () => {
    const msg = buildContinuationMessage({
      stepName: "code-fixer",
      findingsPath: "specrunner/changes/s/review-feedback-001.md",
      slug: "s",
    });
    expect(msg).toContain("reviewer");
  });

  it("embeds findings block when findings provided", () => {
    const findings = [makeFinding()];
    const msg = buildContinuationMessage({
      stepName: "code-fixer",
      findingsPath: "p",
      slug: "s",
      findings,
      reviewerName: "security",
    });
    expect(msg).toContain("Findings from");
    expect(msg).toContain("Test finding");
  });

  it("uses findingsPath when no findings provided", () => {
    const msg = buildContinuationMessage({
      stepName: "code-fixer",
      findingsPath: "specrunner/changes/s/security-result-001.md",
      slug: "s",
    });
    expect(msg).toContain("specrunner/changes/s/security-result-001.md");
  });
});
