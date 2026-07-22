/**
 * Intended-invariant tests for round-git-scope pure logic.
 *
 * T-01 (round-owned-git-effects): these tests fix the changed⊆declared / scoped staging
 * contract as a pure function, without any git / executor dependencies.
 *
 * Scenarios:
 *   1. Only declared outputs in changed → toStage = declared outputs, offending = []
 *   2. Undeclared path in changed → included in offending
 *   3. Pipeline-managed paths in changed → excluded from both offending AND toStage
 *   4. Deleted declared file (changed ∩ declared) → toStage includes it
 *   5. Declared file not in changed → absent from toStage (no pathspec mismatch)
 */

import { describe, it, expect } from "vitest";
import { pipelineManagedPaths, partitionRoundChanges, excludeChangeFolderPaths } from "../round-git-scope.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLUG = "my-change";

/** Pipeline-managed paths for SLUG */
const STATE_JSON = `specrunner/changes/${SLUG}/state.json`;
const EVENTS_JSONL = `specrunner/changes/${SLUG}/events.jsonl`;
const USAGE_JSON = `specrunner/changes/${SLUG}/usage.json`;
const BITE_EVIDENCE = `specrunner/changes/${SLUG}/bite-evidence-result.md`;
const PR_CREATE_RESULT = `specrunner/changes/${SLUG}/pr-create-result.md`;

/** Declared output paths (typical reviewer result files) */
const DECLARED_A = `specrunner/changes/${SLUG}/spec-result-001.md`;
const DECLARED_B = `specrunner/changes/${SLUG}/review-feedback-001.md`;

/** An undeclared path (a source file not listed in any member's writes()) */
const UNDECLARED_SRC = "src/foo.ts";
const UNDECLARED_OTHER = "some/other/file.md";

// ---------------------------------------------------------------------------
// pipelineManagedPaths
// ---------------------------------------------------------------------------

describe("pipelineManagedPaths", () => {
  // TC-002: pipelineManagedPaths が pr-create-result.md を含む（長さ 5）
  //
  // Destruction confirmation: prCreateResultPath を配列から外すと toHaveLength(5) および
  // toContain(PR_CREATE_RESULT) が fail する
  it("TC-002: returns state.json, events.jsonl, usage.json, bite-evidence-result.md, pr-create-result.md for the given slug", () => {
    const paths = pipelineManagedPaths(SLUG);
    expect(paths).toContain(STATE_JSON);
    expect(paths).toContain(EVENTS_JSONL);
    expect(paths).toContain(USAGE_JSON);
    expect(paths).toContain(BITE_EVIDENCE);
    // TC-002: prCreateResultPath must be included (#898 fix, T-01)
    expect(paths).toContain(PR_CREATE_RESULT);
    expect(paths).toHaveLength(5);
  });

  // Destruction confirmation: prCreateResultPath を pipelineManagedPaths から除去すると
  // 「pr-create-result.md in changed → excluded from BOTH offending AND toStage」が fail する
  // (offending に PR_CREATE_RESULT が入り、expect(offending).toHaveLength(0) が赤になる)

  it("uses the slug to build paths under specrunner/changes/<slug>/", () => {
    const other = "other-slug";
    const paths = pipelineManagedPaths(other);
    expect(paths.every((p) => p.startsWith(`specrunner/changes/${other}/`))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// partitionRoundChanges — scenario 1: only declared outputs changed
// ---------------------------------------------------------------------------

describe("partitionRoundChanges — only declared outputs in changed", () => {
  it("toStage = declared outputs, offending = []", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, DECLARED_B],
      declared: [DECLARED_A, DECLARED_B],
      slug: SLUG,
    });
    expect(toStage).toContain(DECLARED_A);
    expect(toStage).toContain(DECLARED_B);
    expect(toStage).toHaveLength(2);
    expect(offending).toHaveLength(0);
  });

  it("single declared path → toStage contains exactly that path", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(offending).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// partitionRoundChanges — scenario 2: undeclared path in changed
// ---------------------------------------------------------------------------

describe("partitionRoundChanges — undeclared path in changed", () => {
  it("undeclared src file → included in offending", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, UNDECLARED_SRC],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(offending).toContain(UNDECLARED_SRC);
  });

  it("multiple undeclared files → all included in offending", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, UNDECLARED_SRC, UNDECLARED_OTHER],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(offending).toContain(UNDECLARED_SRC);
    expect(offending).toContain(UNDECLARED_OTHER);
    expect(offending).toHaveLength(2);
  });

  it("entirely undeclared changes → toStage = [], offending = all changed", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [UNDECLARED_SRC, UNDECLARED_OTHER],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toHaveLength(0);
    expect(offending).toContain(UNDECLARED_SRC);
    expect(offending).toContain(UNDECLARED_OTHER);
  });
});

// ---------------------------------------------------------------------------
// partitionRoundChanges — scenario 3: pipeline-managed paths in changed
// ---------------------------------------------------------------------------

describe("partitionRoundChanges — pipeline-managed paths in changed", () => {
  it("state.json in changed → excluded from BOTH offending AND toStage", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, STATE_JSON],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(toStage).not.toContain(STATE_JSON);
    expect(offending).not.toContain(STATE_JSON);
  });

  it("events.jsonl in changed → excluded from both", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, EVENTS_JSONL],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(offending).toHaveLength(0);
  });

  it("usage.json in changed → excluded from both", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, USAGE_JSON],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(offending).toHaveLength(0);
  });

  it("all three pipeline-managed paths in changed → none in offending or toStage", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, STATE_JSON, EVENTS_JSONL, USAGE_JSON],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    expect(toStage).toEqual([DECLARED_A]);
    expect(offending).toHaveLength(0);
  });

  it("pipeline-managed only (no declared changes) → toStage = [], offending = []", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [STATE_JSON, EVENTS_JSONL, USAGE_JSON],
      declared: [DECLARED_A, DECLARED_B],
      slug: SLUG,
    });
    expect(toStage).toHaveLength(0);
    expect(offending).toHaveLength(0);
  });

  // TC-001: pr-create-result.md のみが dirty な round で offending が空になる (#898 regression)
  //
  // Mirrors the bite-evidence-result.md regression test (#888).
  // Destruction confirmation: prCreateResultPath を pipelineManagedPaths から除去すると
  // このテストが fail する — offending に PR_CREATE_RESULT が入り toHaveLength(0) が赤になる。
  it("TC-001: pr-create-result.md in changed → excluded from BOTH offending AND toStage", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A, PR_CREATE_RESULT],
      declared: [DECLARED_A],
      slug: SLUG,
    });
    // PR_CREATE_RESULT is pipeline-managed → must NOT appear in toStage
    expect(toStage).toEqual([DECLARED_A]);
    expect(toStage).not.toContain(PR_CREATE_RESULT);
    // PR_CREATE_RESULT is pipeline-managed → must NOT appear in offending
    expect(offending).not.toContain(PR_CREATE_RESULT);
    expect(offending).toHaveLength(0);
  });

  // TC-001 (pr-create-result.md only in changed — no other declared changes)
  it("TC-001: pr-create-result.md only in changed (no declared changes) → toStage = [], offending = []", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [PR_CREATE_RESULT],
      declared: [],
      slug: SLUG,
    });
    expect(toStage).toHaveLength(0);
    expect(offending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// partitionRoundChanges — scenario 4: deleted declared file
// ---------------------------------------------------------------------------

describe("partitionRoundChanges — deleted declared file (changed ∩ declared)", () => {
  it("declared path that appears in changed (e.g. deletion) → in toStage, not in offending", () => {
    // A declared file that was deleted: it appears in `changed` (git reports the deletion)
    // but is also in `declared`. Should go to toStage (deletion is staged), not offending.
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A],
      declared: [DECLARED_A, DECLARED_B],
      slug: SLUG,
    });
    expect(toStage).toContain(DECLARED_A);
    expect(offending).not.toContain(DECLARED_A);
  });
});

// ---------------------------------------------------------------------------
// partitionRoundChanges — scenario 5: declared file not in changed
// ---------------------------------------------------------------------------

describe("partitionRoundChanges — declared file absent from changed", () => {
  it("declared path not written by member → absent from toStage (no pathspec mismatch)", () => {
    // DECLARED_B is declared but not changed (member did not write it)
    const { toStage, offending } = partitionRoundChanges({
      changed: [DECLARED_A],
      declared: [DECLARED_A, DECLARED_B],
      slug: SLUG,
    });
    expect(toStage).toContain(DECLARED_A);
    expect(toStage).not.toContain(DECLARED_B);
    expect(offending).toHaveLength(0);
  });

  it("no files changed → toStage = [], offending = []", () => {
    const { toStage, offending } = partitionRoundChanges({
      changed: [],
      declared: [DECLARED_A, DECLARED_B],
      slug: SLUG,
    });
    expect(toStage).toHaveLength(0);
    expect(offending).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// excludeChangeFolderPaths — intended-invariant tests (T-01)
//
// Acceptance criteria:
//   - change folder paths (specrunner/changes/... ) are excluded
//   - source paths outside the change folder are retained
//   - boundary: paths with the same prefix but NOT under the change folder
//     are retained (e.g., "specrunner/changes-not-a-child/file.ts")
//   - order is preserved; function is pure (no I/O)
// ---------------------------------------------------------------------------

const CHANGE_FOLDER_FINDINGS = `specrunner/changes/${SLUG}/${SLUG}-result-001.md`;
const CHANGE_FOLDER_FEEDBACK = `specrunner/changes/${SLUG}/review-feedback-001.md`;
const CHANGE_FOLDER_STATE = `specrunner/changes/${SLUG}/state.json`;
const SOURCE_TS = "src/foo.ts";
const REVIEWERS_MD = "specrunner/reviewers/x.md";
const PROJECT_MD = "specrunner/project.md";
const SAME_PREFIX_DIFFERENT_DIR = "specrunner/changes-not-a-child/file.ts";

describe("excludeChangeFolderPaths — change folder paths are excluded", () => {
  it("findings file under change folder is excluded", () => {
    const result = excludeChangeFolderPaths([CHANGE_FOLDER_FINDINGS]);
    expect(result).toHaveLength(0);
  });

  it("review-feedback file under change folder is excluded", () => {
    const result = excludeChangeFolderPaths([CHANGE_FOLDER_FEEDBACK]);
    expect(result).toHaveLength(0);
  });

  it("state.json under change folder is excluded", () => {
    const result = excludeChangeFolderPaths([CHANGE_FOLDER_STATE]);
    expect(result).toHaveLength(0);
  });

  it("multiple change folder files are all excluded", () => {
    const result = excludeChangeFolderPaths([
      CHANGE_FOLDER_FINDINGS,
      CHANGE_FOLDER_FEEDBACK,
      CHANGE_FOLDER_STATE,
    ]);
    expect(result).toHaveLength(0);
  });
});

describe("excludeChangeFolderPaths — source paths outside change folder are retained", () => {
  it("src/foo.ts is retained", () => {
    const result = excludeChangeFolderPaths([SOURCE_TS]);
    expect(result).toEqual([SOURCE_TS]);
  });

  it("specrunner/reviewers/x.md is retained", () => {
    const result = excludeChangeFolderPaths([REVIEWERS_MD]);
    expect(result).toEqual([REVIEWERS_MD]);
  });

  it("specrunner/project.md is retained", () => {
    const result = excludeChangeFolderPaths([PROJECT_MD]);
    expect(result).toEqual([PROJECT_MD]);
  });

  it("all source paths retained in order", () => {
    const result = excludeChangeFolderPaths([SOURCE_TS, REVIEWERS_MD, PROJECT_MD]);
    expect(result).toEqual([SOURCE_TS, REVIEWERS_MD, PROJECT_MD]);
  });
});

describe("excludeChangeFolderPaths — boundary: same prefix but different directory is retained", () => {
  it("specrunner/changes-not-a-child/file.ts is NOT excluded (different dir)", () => {
    const result = excludeChangeFolderPaths([SAME_PREFIX_DIFFERENT_DIR]);
    expect(result).toEqual([SAME_PREFIX_DIFFERENT_DIR]);
  });

  it("mix of change folder and same-prefix-different-dir: only change folder excluded", () => {
    const result = excludeChangeFolderPaths([CHANGE_FOLDER_FINDINGS, SAME_PREFIX_DIFFERENT_DIR]);
    expect(result).toEqual([SAME_PREFIX_DIFFERENT_DIR]);
  });
});

describe("excludeChangeFolderPaths — edge cases", () => {
  it("empty array → empty array", () => {
    expect(excludeChangeFolderPaths([])).toEqual([]);
  });

  it("all change folder → []", () => {
    expect(excludeChangeFolderPaths([
      CHANGE_FOLDER_FINDINGS,
      CHANGE_FOLDER_FEEDBACK,
      CHANGE_FOLDER_STATE,
    ])).toEqual([]);
  });

  it("all source → input preserved in order", () => {
    const input = [SOURCE_TS, REVIEWERS_MD, PROJECT_MD];
    expect(excludeChangeFolderPaths(input)).toEqual(input);
  });

  it("mix of source and change folder → only source retained, order preserved", () => {
    const result = excludeChangeFolderPaths([
      SOURCE_TS,
      CHANGE_FOLDER_FINDINGS,
      REVIEWERS_MD,
      CHANGE_FOLDER_FEEDBACK,
      PROJECT_MD,
    ]);
    expect(result).toEqual([SOURCE_TS, REVIEWERS_MD, PROJECT_MD]);
  });
});
