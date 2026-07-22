/**
 * Unit tests for canonical doc path helpers added to src/util/paths.ts.
 *
 * These functions are pure (no I/O, no other src/ imports) per the paths.ts constraint.
 *
 * TC-011: canonicalDocPaths が正典 5 パスを返す
 * TC-012: isCanonicalDocPath が正典文書に true を返す
 * TC-013: isCanonicalDocPath が pipeline 出力・state ファイルに false を返す
 * TC-014: isCanonicalDocPath が archive 配下のパスに false を返す (should)
 * TC-015: isCanonicalDocPath が change folder 外パスに false を返す
 *
 * RED phase: canonicalDocPaths and isCanonicalDocPath do not exist yet.
 * These tests will fail with an import/type error until T-01 is implemented.
 */
import { describe, it, expect } from "vitest";
import { canonicalDocPaths, isCanonicalDocPath } from "../paths.js";

// ---------------------------------------------------------------------------
// TC-011: canonicalDocPaths
// ---------------------------------------------------------------------------

describe("canonicalDocPaths (TC-011)", () => {
  it("TC-011: returns the 5 canonical document paths under specrunner/changes/<slug>/", () => {
    const paths = canonicalDocPaths("foo");
    expect(paths).toEqual([
      "specrunner/changes/foo/request.md",
      "specrunner/changes/foo/spec.md",
      "specrunner/changes/foo/design.md",
      "specrunner/changes/foo/tasks.md",
      "specrunner/changes/foo/test-cases.md",
    ]);
  });

  it("TC-011: returns exactly 5 paths (no more, no less)", () => {
    expect(canonicalDocPaths("my-slug")).toHaveLength(5);
  });

  it("TC-011: all returned paths start with specrunner/changes/<slug>/", () => {
    const slug = "custom-reviewer-binding";
    const paths = canonicalDocPaths(slug);
    for (const p of paths) {
      expect(p.startsWith(`specrunner/changes/${slug}/`)).toBe(true);
    }
  });

  it("TC-011: function is pure — different slugs produce different paths", () => {
    const pathsA = canonicalDocPaths("slug-a");
    const pathsB = canonicalDocPaths("slug-b");
    for (let i = 0; i < 5; i++) {
      expect(pathsA[i]).not.toBe(pathsB[i]);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-012: isCanonicalDocPath — true for canonical docs
// ---------------------------------------------------------------------------

describe("isCanonicalDocPath — canonical documents (TC-012)", () => {
  it("TC-012: returns true for request.md under a slug", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/request.md")).toBe(true);
  });

  it("TC-012: returns true for spec.md under a slug", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/spec.md")).toBe(true);
  });

  it("TC-012: returns true for design.md under a slug", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/design.md")).toBe(true);
  });

  it("TC-012: returns true for tasks.md under a slug", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/tasks.md")).toBe(true);
  });

  it("TC-012: returns true for test-cases.md under a slug", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/test-cases.md")).toBe(true);
  });

  it("TC-012: returns true for all 5 filenames across different slugs", () => {
    const slugs = ["foo", "my-change", "custom-reviewer-canon-binding"];
    const names = ["request.md", "spec.md", "design.md", "tasks.md", "test-cases.md"];
    for (const slug of slugs) {
      for (const name of names) {
        expect(
          isCanonicalDocPath(`specrunner/changes/${slug}/${name}`),
          `${slug}/${name} should be canonical`,
        ).toBe(true);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// TC-013: isCanonicalDocPath — false for pipeline output and state files
// ---------------------------------------------------------------------------

describe("isCanonicalDocPath — pipeline output files (TC-013)", () => {
  it("TC-013: returns false for result file (<slug>-result-001.md)", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/foo-result-001.md")).toBe(false);
  });

  it("TC-013: returns false for review-feedback file", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/review-feedback-001.md")).toBe(false);
  });

  it("TC-013: returns false for state.json", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/state.json")).toBe(false);
  });

  it("TC-013: returns false for events.jsonl", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/events.jsonl")).toBe(false);
  });

  it("TC-013: returns false for rules.md (non-canonical change folder file)", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/rules.md")).toBe(false);
  });

  it("TC-013: returns false for usage.json", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo/usage.json")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-014: isCanonicalDocPath — false for archive/canceled subdirectory paths (should)
// ---------------------------------------------------------------------------

describe("isCanonicalDocPath — archive/canceled deep paths (TC-014)", () => {
  it("TC-014: returns false for design.md under archive subdirectory (depth > 2)", () => {
    // archive/<dated-slug>/design.md is at depth 3 under changes/ — not canonical
    expect(isCanonicalDocPath("specrunner/changes/archive/2026-01-01-foo/design.md")).toBe(false);
  });

  it("TC-014: returns false for request.md under canceled subdirectory", () => {
    expect(isCanonicalDocPath("specrunner/changes/canceled/foo/request.md")).toBe(false);
  });

  it("TC-014: returns false for any canonical name nested deeper than slug level", () => {
    // Path: specrunner/changes/<sub>/<slug>/request.md — too deep
    expect(isCanonicalDocPath("specrunner/changes/sub/slug/request.md")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-015: isCanonicalDocPath — false for paths outside change folder
// ---------------------------------------------------------------------------

describe("isCanonicalDocPath — paths outside change folder (TC-015)", () => {
  it("TC-015: returns false for src/ paths", () => {
    expect(isCanonicalDocPath("src/foo.ts")).toBe(false);
  });

  it("TC-015: returns false for specrunner/reviewers/ paths", () => {
    expect(isCanonicalDocPath("specrunner/reviewers/x.md")).toBe(false);
  });

  it("TC-015: returns false for specrunner/project.md", () => {
    expect(isCanonicalDocPath("specrunner/project.md")).toBe(false);
  });

  it("TC-015: returns false for empty string", () => {
    expect(isCanonicalDocPath("")).toBe(false);
  });

  it("TC-015: returns false for specrunner/changes (the folder itself without a slug)", () => {
    expect(isCanonicalDocPath("specrunner/changes")).toBe(false);
  });

  it("TC-015: returns false for specrunner/changes/ with only slug (no filename)", () => {
    expect(isCanonicalDocPath("specrunner/changes/foo")).toBe(false);
  });
});
