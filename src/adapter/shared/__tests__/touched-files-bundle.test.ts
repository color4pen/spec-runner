/**
 * Unit tests for buildTouchedFilesSection (TC-013 to TC-016).
 *
 * TC-013: 先行 step 記録あり → セクションと制限禁止文言が含まれる
 * TC-014: 記録なし → 従来 prompt と同一（"" を返す）
 * TC-015: currentStepName は注入対象から除外される
 * TC-016: 16KB 超過 → 注入なし（"" を返す）
 */

import { describe, it, expect } from "vitest";
import { buildTouchedFilesSection, isChangeFolderPath } from "../touched-files-bundle.js";
import type { JobState } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use unknown cast to allow touchedFiles before T-01 adds it to JobState type
function makeStateWithTouchedFiles(
  touchedFiles: Record<string, string[]>,
): JobState {
  return { touchedFiles } as unknown as JobState;
}

function makeEmptyState(): JobState {
  return {} as unknown as JobState;
}

// ---------------------------------------------------------------------------
// TC-013: 先行 step 記録あり → セクションと制限禁止文言が含まれる
// ---------------------------------------------------------------------------

describe("TC-013: prior step records → section with step name and restriction-forbidden wording", () => {
  it("returns a non-empty string containing step name and file list when prior steps have records", () => {
    const state = makeStateWithTouchedFiles({
      implementer: ["src/core/foo.ts", "src/adapter/bar.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    expect(section).not.toBe("");
    expect(section).toContain("implementer");
    expect(section).toContain("src/core/foo.ts");
    expect(section).toContain("src/adapter/bar.ts");
  });

  it("section contains the restriction-forbidden wording (制限してはならない)", () => {
    const state = makeStateWithTouchedFiles({
      implementer: ["src/core/foo.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    // Must include the key phrase prohibiting scope restriction
    expect(section).toMatch(/制限してはならない|must not.*restrict|do not.*restrict|restrict.*must not/i);
  });

  it("section mentions hint wording (出発点 or hint or starting point)", () => {
    const state = makeStateWithTouchedFiles({
      implementer: ["src/core/foo.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    // Should mention the hint/starting point concept
    expect(section).toMatch(/出発点|hint|starting point/i);
  });

  it("multiple prior steps appear in the section", () => {
    const state = makeStateWithTouchedFiles({
      design: ["specrunner/changes/my-change/design.md"],
      implementer: ["src/core/foo.ts", "src/core/bar.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    expect(section).toContain("implementer");
    expect(section).toContain("src/core/foo.ts");
    expect(section).toContain("src/core/bar.ts");
    // change-folder paths are filtered at injection time (defense in depth)
    expect(section).not.toContain("specrunner/changes/my-change/design.md");
  });

  it("change-folder paths in state.touchedFiles are not injected (defense in depth)", () => {
    const state = makeStateWithTouchedFiles({
      implementer: [
        "src/core/real.ts",
        "specrunner/changes/my-slug/design.md",
        "src/adapter/foo.ts",
      ],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    expect(section).toContain("src/core/real.ts");
    expect(section).toContain("src/adapter/foo.ts");
    expect(section).not.toContain("specrunner/changes/my-slug/design.md");
  });

  it("step whose only files are change-folder paths produces no section entry", () => {
    const state = makeStateWithTouchedFiles({
      design: ["specrunner/changes/slug/design.md", "specrunner/changes/slug/spec.md"],
      implementer: ["src/core/real.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    // design step's files are all change-folder → filtered; design step not in section
    expect(section).not.toContain("design");
    expect(section).toContain("implementer");
    expect(section).toContain("src/core/real.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-014: 記録なし → "" を返す（fail-open）
// ---------------------------------------------------------------------------

describe("TC-014: no records → returns empty string (fail-open)", () => {
  it("returns empty string when touchedFiles is absent", () => {
    const state = makeEmptyState();
    const section = buildTouchedFilesSection(state, "code-review");
    expect(section).toBe("");
  });

  it("returns empty string when touchedFiles is empty object", () => {
    const state = makeStateWithTouchedFiles({});
    const section = buildTouchedFilesSection(state, "code-review");
    expect(section).toBe("");
  });

  it("returns empty string when all step entries are empty arrays", () => {
    const state = makeStateWithTouchedFiles({
      implementer: [],
      design: [],
    });
    const section = buildTouchedFilesSection(state, "code-review");
    expect(section).toBe("");
  });
});

// ---------------------------------------------------------------------------
// TC-015: currentStepName は注入対象から除外される
// ---------------------------------------------------------------------------

describe("TC-015: currentStepName entries are excluded from injection", () => {
  it("returns empty string when only entry is the current step", () => {
    const state = makeStateWithTouchedFiles({
      "code-review": ["src/core/something.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    expect(section).toBe("");
  });

  it("excludes currentStep but includes other steps", () => {
    const state = makeStateWithTouchedFiles({
      implementer: ["src/core/impl.ts"],
      "code-review": ["src/core/review-notes.md"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    expect(section).toContain("implementer");
    expect(section).toContain("src/core/impl.ts");
    expect(section).not.toContain("code-review");
    expect(section).not.toContain("review-notes.md");
  });
});

// ---------------------------------------------------------------------------
// TC-016: 16KB 超過 → 注入なし（"" を返す）
// ---------------------------------------------------------------------------

describe("TC-016: section exceeding 16KB returns empty string", () => {
  it("returns empty string when constructed section exceeds 16 * 1024 bytes", () => {
    // 300 entries × ~112 chars ≈ 33,600 bytes > 16,384 bytes (16KB)
    const veryLargeFileList = Array.from(
      { length: 300 },
      (_, i) =>
        `src/very/long/path/to/a/deeply/nested/module/subdir/another/level/file-${i.toString().padStart(4, "0")}.ts`,
    );
    const state = makeStateWithTouchedFiles({
      implementer: veryLargeFileList,
    });

    const section = buildTouchedFilesSection(state, "code-review");

    expect(section).toBe("");
  });

  it("does not return a partial section when over limit — all-or-nothing", () => {
    const veryLargeFileList = Array.from(
      { length: 400 },
      (_, i) =>
        `src/very/long/path/to/a/deeply/nested/module/subdir/another/level/file-${i.toString().padStart(4, "0")}.ts`,
    );
    const state = makeStateWithTouchedFiles({
      implementer: veryLargeFileList,
    });

    const section = buildTouchedFilesSection(state, "code-review");

    // Must be exactly "" — no partial content
    expect(section).toBe("");
  });

  it("returns non-empty when section is under 16KB", () => {
    const state = makeStateWithTouchedFiles({
      implementer: ["src/core/foo.ts", "src/adapter/bar.ts"],
    });

    const section = buildTouchedFilesSection(state, "code-review");

    // Small state should produce a non-empty section
    expect(section).not.toBe("");
  });
});

// ---------------------------------------------------------------------------
// isChangeFolderPath: single-source predicate (D4/item-3)
// ---------------------------------------------------------------------------

describe("isChangeFolderPath: change-folder exclusion predicate", () => {
  it("returns true for a path under specrunner/changes/", () => {
    expect(isChangeFolderPath("specrunner/changes/my-slug/design.md")).toBe(true);
  });

  it("returns false for a src/ path", () => {
    expect(isChangeFolderPath("src/core/foo.ts")).toBe(false);
  });

  it("returns false for specrunner/changes-archive/ (trailing-slash boundary)", () => {
    expect(isChangeFolderPath("specrunner/changes-archive/foo/bar.ts")).toBe(false);
  });

  it("returns false for specrunner/changes itself (no trailing slash)", () => {
    // The directory itself is not a file under the change folder
    expect(isChangeFolderPath("specrunner/changes")).toBe(false);
  });
});
