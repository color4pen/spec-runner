/**
 * Unit tests for src/util/paths.ts — draft-related path helpers
 *
 * TC-PATHS-001: draftPath() returns "specrunner/drafts/<slug>/request.md"
 * TC-PATHS-003: draftPathLegacy() returns "specrunner/drafts/<slug>.md"
 */
import { describe, it, expect } from "vitest";
import {
  draftPath,
  draftPathLegacy,
  archivedChangesDirRel,
  archivedChangeFolderPath,
  localSlugStateJsonPath,
  localSlugEventsPath,
  requestReviewResultPath,
  canceledChangesDirRel,
  canceledChangeFolderPath,
  canceledDirName,
} from "../../../src/util/paths.js";

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

// TC-008: canceledChangesDirRel() returns the correct reserved path
describe("TC-008: canceledChangesDirRel()", () => {
  it("returns 'specrunner/changes/canceled'", () => {
    expect(canceledChangesDirRel()).toBe("specrunner/changes/canceled");
  });
});

// TC-009: canceledChangeFolderPath() joins dirName correctly
describe("TC-009: canceledChangeFolderPath()", () => {
  it("returns 'specrunner/changes/canceled/<dirName>'", () => {
    expect(canceledChangeFolderPath("foo-1234abcd")).toBe(
      "specrunner/changes/canceled/foo-1234abcd",
    );
  });

  it("handles slugs with multiple hyphens", () => {
    expect(canceledChangeFolderPath("my-feature-slug-ab1234ef")).toBe(
      "specrunner/changes/canceled/my-feature-slug-ab1234ef",
    );
  });
});

// TC-010: canceledDirName() uses slug + first 8 hex chars of jobId
describe("TC-010: canceledDirName()", () => {
  it("combines slug and first 8 chars of jobId", () => {
    expect(canceledDirName("foo", "1234abcd-aaaa-bbbb-cccc-ddddeeeeffff")).toBe("foo-1234abcd");
  });

  it("uses only the first 8 characters of a full UUID", () => {
    const uuid = "ab123456-0000-0000-0000-000000000000";
    expect(canceledDirName("my-slug", uuid)).toBe("my-slug-ab123456");
  });

  it("handles slugs with hyphens", () => {
    expect(canceledDirName("my-feature-change", "deadbeef-1111-2222-3333-444455556666")).toBe(
      "my-feature-change-deadbeef",
    );
  });
});
