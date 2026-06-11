/**
 * T-04: paths.ts utility function tests — custom reviewer paths.
 */
import { describe, it, expect } from "vitest";
import {
  customReviewerResultPath,
  resolveReviewerResultPath,
  reviewFeedbackPath,
} from "../paths.js";

// ---------------------------------------------------------------------------
// customReviewerResultPath
// ---------------------------------------------------------------------------

describe("customReviewerResultPath", () => {
  it("returns correct path for reviewer name 'security' iteration 2", () => {
    expect(customReviewerResultPath("foo", "security", 2)).toBe(
      "specrunner/changes/foo/security-result-002.md",
    );
  });

  it("zero-pads iteration to 3 digits", () => {
    expect(customReviewerResultPath("my-change", "perf", 1)).toBe(
      "specrunner/changes/my-change/perf-result-001.md",
    );
  });

  it("handles iteration ≥ 100 without truncation", () => {
    expect(customReviewerResultPath("slug", "r", 100)).toBe(
      "specrunner/changes/slug/r-result-100.md",
    );
  });
});

// ---------------------------------------------------------------------------
// resolveReviewerResultPath — dispatch logic
// ---------------------------------------------------------------------------

describe("resolveReviewerResultPath", () => {
  it("dispatches 'code-review' to reviewFeedbackPath", () => {
    expect(resolveReviewerResultPath("foo", "code-review", 1)).toBe(
      reviewFeedbackPath("foo", 1),
    );
  });

  it("dispatches custom reviewer name to customReviewerResultPath", () => {
    expect(resolveReviewerResultPath("foo", "security", 2)).toBe(
      customReviewerResultPath("foo", "security", 2),
    );
  });

  it("dispatches unknown reviewer name without throwing", () => {
    expect(() => resolveReviewerResultPath("foo", "new-future-reviewer", 1)).not.toThrow();
  });

  it("zero-pads consistently for both dispatch paths", () => {
    const codeReview = resolveReviewerResultPath("s", "code-review", 5);
    const custom = resolveReviewerResultPath("s", "style", 5);
    expect(codeReview).toContain("-005.md");
    expect(custom).toContain("-005.md");
  });
});
