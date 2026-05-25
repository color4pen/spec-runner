/**
 * Unit tests for src/util/paths.ts — draft-related path helpers
 *
 * TC-PATHS-001: draftPath() returns "specrunner/drafts/<slug>/request.md"
 * TC-PATHS-003: draftPathLegacy() returns "specrunner/drafts/<slug>.md"
 */
import { describe, it, expect } from "vitest";
import { draftPath, draftPathLegacy, archivedChangesDirRel, archivedChangeFolderPath } from "../../../src/util/paths.js";

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
