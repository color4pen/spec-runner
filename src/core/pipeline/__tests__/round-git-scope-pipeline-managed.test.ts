/**
 * Unit tests for excludePipelineManagedChangePaths in round-git-scope.ts.
 *
 * This tests the renamed and semantically-narrowed replacement for excludeChangeFolderPaths:
 * - Previously: excluded ALL paths under specrunner/changes/
 * - Now (after T-02): excludes pipeline outputs only; canonical docs are PRESERVED
 *
 * TC-004: reviewer 自身の findings commit（pipeline 出力のみ変更）は source-touched に現れない
 * TC-005: 正典文書の変更は source-touched に現れる（除外されない）
 * TC-016: 正典文書は除外されず保持される
 * TC-017: pipeline 出力ファイルは除外される
 * TC-018: change folder 外のパスは保持される
 * TC-019: 同 prefix 別ディレクトリのパスは保持される（should）
 *
 * RED phase: excludePipelineManagedChangePaths does not exist yet.
 * The existing excludeChangeFolderPaths will be renamed and semantically updated in T-02.
 *
 * Destruction confirmation (TC-047):
 *   If this function is reverted to the old excludeChangeFolderPaths (full change-folder exclusion),
 *   TC-005 and TC-016 will fail (canonical docs would be excluded).
 *   TC-004 and TC-017 would still pass in both old and new implementations.
 */
import { describe, it, expect } from "vitest";
import { excludePipelineManagedChangePaths } from "../round-git-scope.js";

const SLUG = "my-change";

// ---------------------------------------------------------------------------
// Paths under the change folder
// ---------------------------------------------------------------------------

/** Canonical doc paths — MUST be preserved after exclusion */
const DESIGN_MD = `specrunner/changes/${SLUG}/design.md`;
const REQUEST_MD = `specrunner/changes/${SLUG}/request.md`;
const SPEC_MD = `specrunner/changes/${SLUG}/spec.md`;
const TASKS_MD = `specrunner/changes/${SLUG}/tasks.md`;
const TEST_CASES_MD = `specrunner/changes/${SLUG}/test-cases.md`;

/** Pipeline output paths — MUST be excluded */
const FINDINGS_RESULT = `specrunner/changes/${SLUG}/${SLUG}-result-001.md`;
const REVIEW_FEEDBACK = `specrunner/changes/${SLUG}/review-feedback-001.md`;
const STATE_JSON = `specrunner/changes/${SLUG}/state.json`;
const EVENTS_JSONL = `specrunner/changes/${SLUG}/events.jsonl`;
const RULES_MD = `specrunner/changes/${SLUG}/rules.md`;
const USAGE_JSON = `specrunner/changes/${SLUG}/usage.json`;
const ATTESTATION = `specrunner/changes/${SLUG}/request-review-attestation.json`;

/** Change folder outside paths */
const SOURCE_TS = "src/foo.ts";
const REVIEWERS_MD = "specrunner/reviewers/x.md";
const PROJECT_MD = "specrunner/project.md";
const SAME_PREFIX_DIFF_DIR = "specrunner/changes-not-a-child/file.ts";

// ---------------------------------------------------------------------------
// TC-004: reviewer findings commit does not appear in source-touched
//
// Purpose: reviewer's own findings commit (pipeline output only) must NOT
// trigger reviewer invalidation. This is the existing goal of the filter.
// ---------------------------------------------------------------------------

describe("TC-004: reviewer findings commit does not appear in source-touched", () => {
  it("TC-004: findings result file is excluded — no invalidation from own findings commit", () => {
    const result = excludePipelineManagedChangePaths([FINDINGS_RESULT]);
    expect(result).toHaveLength(0);
  });

  it("TC-004: multiple pipeline output files are all excluded (findings + feedback + state)", () => {
    const result = excludePipelineManagedChangePaths([
      FINDINGS_RESULT,
      REVIEW_FEEDBACK,
      STATE_JSON,
    ]);
    expect(result).toHaveLength(0);
  });

  it("TC-004: events.jsonl and usage.json excluded (pipeline-managed, not source)", () => {
    const result = excludePipelineManagedChangePaths([EVENTS_JSONL, USAGE_JSON]);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-005: canonical doc change appears in source-touched
//
// This is the KEY semantic change from the old excludeChangeFolderPaths:
// canonical docs under the change folder are now PRESERVED, not excluded.
// ---------------------------------------------------------------------------

describe("TC-005: canonical doc change appears in source-touched", () => {
  it("TC-005: design.md is NOT excluded — remains in touched list", () => {
    const result = excludePipelineManagedChangePaths([DESIGN_MD]);
    expect(result).toContain(DESIGN_MD);
  });

  it("TC-005: all 5 canonical docs remain in touched list when changed", () => {
    const input = [REQUEST_MD, SPEC_MD, DESIGN_MD, TASKS_MD, TEST_CASES_MD];
    const result = excludePipelineManagedChangePaths(input);
    expect(result).toEqual(input);
  });

  it("TC-005: mixed canonical + pipeline output: only pipeline output excluded", () => {
    const input = [DESIGN_MD, FINDINGS_RESULT];
    const result = excludePipelineManagedChangePaths(input);
    expect(result).toContain(DESIGN_MD);
    expect(result).not.toContain(FINDINGS_RESULT);
  });
});

// ---------------------------------------------------------------------------
// TC-016: canonical doc paths are not excluded
// ---------------------------------------------------------------------------

describe("TC-016: canonical doc paths are preserved (TC-016)", () => {
  it("TC-016: design.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([DESIGN_MD])).toEqual([DESIGN_MD]);
  });

  it("TC-016: request.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([REQUEST_MD])).toEqual([REQUEST_MD]);
  });

  it("TC-016: spec.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([SPEC_MD])).toEqual([SPEC_MD]);
  });

  it("TC-016: tasks.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([TASKS_MD])).toEqual([TASKS_MD]);
  });

  it("TC-016: test-cases.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([TEST_CASES_MD])).toEqual([TEST_CASES_MD]);
  });
});

// ---------------------------------------------------------------------------
// TC-017: pipeline output files are excluded
// ---------------------------------------------------------------------------

describe("TC-017: pipeline output files are excluded (TC-017)", () => {
  it("TC-017: result file (<slug>-result-001.md) is excluded", () => {
    expect(excludePipelineManagedChangePaths([FINDINGS_RESULT])).toEqual([]);
  });

  it("TC-017: review-feedback file is excluded", () => {
    expect(excludePipelineManagedChangePaths([REVIEW_FEEDBACK])).toEqual([]);
  });

  it("TC-017: state.json is excluded", () => {
    expect(excludePipelineManagedChangePaths([STATE_JSON])).toEqual([]);
  });

  it("TC-017: events.jsonl is excluded", () => {
    expect(excludePipelineManagedChangePaths([EVENTS_JSONL])).toEqual([]);
  });

  it("TC-017: rules.md (pipeline-managed) is excluded", () => {
    expect(excludePipelineManagedChangePaths([RULES_MD])).toEqual([]);
  });

  it("TC-017: attestation JSON is excluded", () => {
    expect(excludePipelineManagedChangePaths([ATTESTATION])).toEqual([]);
  });

  it("TC-017: all pipeline output types are excluded together", () => {
    const result = excludePipelineManagedChangePaths([
      FINDINGS_RESULT,
      REVIEW_FEEDBACK,
      STATE_JSON,
      EVENTS_JSONL,
      RULES_MD,
      USAGE_JSON,
    ]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-018: paths outside change folder are preserved
// ---------------------------------------------------------------------------

describe("TC-018: paths outside change folder are preserved (TC-018)", () => {
  it("TC-018: src/foo.ts is preserved", () => {
    expect(excludePipelineManagedChangePaths([SOURCE_TS])).toEqual([SOURCE_TS]);
  });

  it("TC-018: specrunner/reviewers/x.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([REVIEWERS_MD])).toEqual([REVIEWERS_MD]);
  });

  it("TC-018: specrunner/project.md is preserved", () => {
    expect(excludePipelineManagedChangePaths([PROJECT_MD])).toEqual([PROJECT_MD]);
  });

  it("TC-018: all outside paths are preserved in their original order", () => {
    const input = [SOURCE_TS, REVIEWERS_MD, PROJECT_MD];
    expect(excludePipelineManagedChangePaths(input)).toEqual(input);
  });
});

// ---------------------------------------------------------------------------
// TC-019: same-prefix different directory is preserved (should)
// ---------------------------------------------------------------------------

describe("TC-019: same-prefix different directory is preserved (TC-019)", () => {
  it("TC-019: specrunner/changes-not-a-child/file.ts is NOT excluded", () => {
    expect(excludePipelineManagedChangePaths([SAME_PREFIX_DIFF_DIR])).toEqual(
      [SAME_PREFIX_DIFF_DIR],
    );
  });

  it("TC-019: mix of change folder and same-prefix-different-dir: only change folder excluded", () => {
    const result = excludePipelineManagedChangePaths([
      FINDINGS_RESULT,
      SAME_PREFIX_DIFF_DIR,
    ]);
    expect(result).toEqual([SAME_PREFIX_DIFF_DIR]);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("excludePipelineManagedChangePaths — edge cases", () => {
  it("empty input → empty output", () => {
    expect(excludePipelineManagedChangePaths([])).toEqual([]);
  });

  it("all pipeline output → empty output", () => {
    expect(excludePipelineManagedChangePaths([
      FINDINGS_RESULT,
      STATE_JSON,
      EVENTS_JSONL,
    ])).toEqual([]);
  });

  it("all canonical docs → all preserved", () => {
    const input = [REQUEST_MD, SPEC_MD, DESIGN_MD, TASKS_MD, TEST_CASES_MD];
    expect(excludePipelineManagedChangePaths(input)).toEqual(input);
  });

  it("order of non-excluded paths is preserved", () => {
    const result = excludePipelineManagedChangePaths([
      SOURCE_TS,
      FINDINGS_RESULT,   // excluded
      DESIGN_MD,
      STATE_JSON,        // excluded
      PROJECT_MD,
    ]);
    expect(result).toEqual([SOURCE_TS, DESIGN_MD, PROJECT_MD]);
  });
});
