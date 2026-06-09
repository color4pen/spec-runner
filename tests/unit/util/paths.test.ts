/**
 * Unit tests for src/util/paths.ts — draft-related path helpers
 *
 * TC-PATHS-001: draftPath() returns "specrunner/drafts/<slug>/request.md"
 * TC-PATHS-003: draftPathLegacy() returns "specrunner/drafts/<slug>.md"
 */
import { describe, it, expect } from "vitest";
import { draftPath, draftPathLegacy, archivedChangesDirRel, archivedChangeFolderPath, localSlugStateJsonPath, localSlugEventsPath, requestReviewResultPath } from "../../../src/util/paths.js";

describe("TC-PATHS-001: draftPath()", () => {
  it("returns directory-format path specrunner/drafts/<slug>/request.md", () => {
    expect(draftPath("my-change")).toBe("specrunner/drafts/my-change/request.md");
  });

  it("handles slugs with hyphens", () => {
    expect(draftPath("some-feature-slug")).toBe(
      "specrunner/drafts/some-feature-slug/request.md",
    );
  });
});

describe("TC-PATHS-003: draftPathLegacy()", () => {
  it("returns legacy flat-file path specrunner/drafts/<slug>.md", () => {
    expect(draftPathLegacy("my-change")).toBe("specrunner/drafts/my-change.md");
  });

  it("handles slugs with hyphens", () => {
    expect(draftPathLegacy("some-feature-slug")).toBe(
      "specrunner/drafts/some-feature-slug.md",
    );
  });
});

describe("archivedChangesDirRel()", () => {
  it("returns specrunner/changes/archive", () => {
    expect(archivedChangesDirRel()).toBe("specrunner/changes/archive");
  });
});

describe("archivedChangeFolderPath()", () => {
  it("returns specrunner/changes/archive/<datedSlug>", () => {
    expect(archivedChangeFolderPath("2026-05-20-my-change")).toBe(
      "specrunner/changes/archive/2026-05-20-my-change",
    );
  });
});

// TC-015: localSlugStateJsonPath() returns the correct machine-local state.json path
describe("TC-015: localSlugStateJsonPath()", () => {
  it("returns .specrunner/local/<slug>/state.json", () => {
    expect(localSlugStateJsonPath("my-feature")).toBe(
      ".specrunner/local/my-feature/state.json",
    );
  });

  it("handles slugs with hyphens", () => {
    expect(localSlugStateJsonPath("some-feature-slug")).toBe(
      ".specrunner/local/some-feature-slug/state.json",
    );
  });
});

// TC-016: localSlugEventsPath() returns the correct machine-local events.jsonl path
describe("TC-016: localSlugEventsPath()", () => {
  it("returns .specrunner/local/<slug>/events.jsonl", () => {
    expect(localSlugEventsPath("my-feature")).toBe(
      ".specrunner/local/my-feature/events.jsonl",
    );
  });

  it("handles slugs with hyphens", () => {
    expect(localSlugEventsPath("some-feature-slug")).toBe(
      ".specrunner/local/some-feature-slug/events.jsonl",
    );
  });
});

// TC-020: requestReviewResultPath() returns correct zero-padded path
describe("TC-020: requestReviewResultPath()", () => {
  it("requestReviewResultPath('foo', 1) returns 'specrunner/changes/foo/request-review-result-001.md'", () => {
    expect(requestReviewResultPath("foo", 1)).toBe(
      "specrunner/changes/foo/request-review-result-001.md",
    );
  });

  it("pads iteration to 3 digits", () => {
    expect(requestReviewResultPath("my-change", 2)).toBe(
      "specrunner/changes/my-change/request-review-result-002.md",
    );
    expect(requestReviewResultPath("my-change", 10)).toBe(
      "specrunner/changes/my-change/request-review-result-010.md",
    );
  });
});
