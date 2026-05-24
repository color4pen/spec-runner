/**
 * Unit tests for src/util/paths.ts — draft-related path helpers
 *
 * TC-PATHS-001: draftPath() returns "specrunner/drafts/<slug>/request.md"
 * TC-PATHS-003: draftPathLegacy() returns "specrunner/drafts/<slug>.md"
 */
import { describe, it, expect } from "vitest";
import { draftPath, draftPathLegacy } from "../../../src/util/paths.js";

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
