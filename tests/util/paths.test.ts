import { describe, it, expect } from "vitest";
import {
  changeFolderPath,
  specReviewResultPath,
  reviewFeedbackPath,
  verificationResultPath,
  prCreateResultPath,
  requestMdPath,
  changesDirRel,
  parseArchiveDirName,
} from "../../src/util/paths.js";

describe("changeFolderPath", () => {
  // TC-001
  it("returns correct path for a simple slug", () => {
    expect(changeFolderPath("my-change")).toBe("specrunner/changes/my-change");
  });

  // TC-011
  it("handles hyphens in slug correctly", () => {
    expect(changeFolderPath("centralize-change-path")).toBe(
      "specrunner/changes/centralize-change-path",
    );
  });
});

describe("specReviewResultPath", () => {
  // TC-002
  it("returns 3-digit zero-padded path for iteration 1", () => {
    expect(specReviewResultPath("my-change", 1)).toBe(
      "specrunner/changes/my-change/spec-review-result-001.md",
    );
  });

  // TC-009
  it("returns 3-digit zero-padded path for iteration 10", () => {
    expect(specReviewResultPath("slug", 10)).toBe(
      "specrunner/changes/slug/spec-review-result-010.md",
    );
  });

  // TC-010
  it("does not truncate for iteration 100", () => {
    expect(specReviewResultPath("slug", 100)).toBe(
      "specrunner/changes/slug/spec-review-result-100.md",
    );
  });
});

describe("reviewFeedbackPath", () => {
  // TC-003
  it("returns 3-digit zero-padded path for iteration 2", () => {
    expect(reviewFeedbackPath("my-change", 2)).toBe(
      "specrunner/changes/my-change/review-feedback-002.md",
    );
  });

  // TC-009 (reviewFeedbackPath)
  it("returns 3-digit zero-padded path for iteration 10", () => {
    expect(reviewFeedbackPath("slug", 10)).toBe(
      "specrunner/changes/slug/review-feedback-010.md",
    );
  });
});

describe("verificationResultPath", () => {
  // TC-004
  it("returns correct path", () => {
    expect(verificationResultPath("my-change")).toBe(
      "specrunner/changes/my-change/verification-result.md",
    );
  });
});

describe("prCreateResultPath", () => {
  // TC-005
  it("returns correct path", () => {
    expect(prCreateResultPath("my-change")).toBe(
      "specrunner/changes/my-change/pr-create-result.md",
    );
  });
});

describe("requestMdPath", () => {
  // TC-006
  it("returns correct path", () => {
    expect(requestMdPath("my-change")).toBe(
      "specrunner/changes/my-change/request.md",
    );
  });
});

describe("changesDirRel", () => {
  // TC-007
  it("returns the changes directory path", () => {
    expect(changesDirRel()).toBe("specrunner/changes");
  });
});

describe("parseArchiveDirName", () => {
  it("parses dated dir: 2026-05-20-foo-bar", () => {
    expect(parseArchiveDirName("2026-05-20-foo-bar")).toEqual({
      date: "2026-05-20",
      slug: "foo-bar",
    });
  });

  it("returns null date for plain slug: foo-bar", () => {
    expect(parseArchiveDirName("foo-bar")).toEqual({
      date: null,
      slug: "foo-bar",
    });
  });

  it("parses dated dir with multi-segment slug: 2026-04-16-phase2-auth-and-app-foundation", () => {
    expect(parseArchiveDirName("2026-04-16-phase2-auth-and-app-foundation")).toEqual({
      date: "2026-04-16",
      slug: "phase2-auth-and-app-foundation",
    });
  });

  it("returns null date for legacy dir without prefix: abolish-success-status", () => {
    expect(parseArchiveDirName("abolish-success-status")).toEqual({
      date: null,
      slug: "abolish-success-status",
    });
  });
});

