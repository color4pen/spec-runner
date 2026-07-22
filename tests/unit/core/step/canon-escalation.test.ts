/**
 * Tests for canon-escalation.ts pure functions.
 *
 * TC-008: reason に file・title・operator 適用の必要性が含まれる
 * TC-010: selectUnroutableCanonFindings は resolution=fixable 以外を除外する
 * TC-011: selectUnroutableCanonFindings は実効 fixer が書ける正典 finding を除外する
 * TC-012: buildCanonEscalationReason は CANON_FINDING_ESCALATION prefix を含む
 *
 * RED: implementation (src/core/step/canon-escalation.ts) does not exist yet.
 */
import { describe, it, expect } from "vitest";
import {
  selectUnroutableCanonFindings,
  buildCanonEscalationReason,
  judgeEffectiveFixer,
  conformanceEffectiveFixer,
  type CanonWriteScope,
} from "../../../../src/core/step/canon-escalation.js";
import type { Finding, FixTarget } from "../../../../src/kernel/report-result.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SLUG = "test-slug";

function makeFixableFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/foo.ts",
    title: "Test finding",
    rationale: "Fix it",
    ...overrides,
  };
}

/**
 * Build a minimal CanonWriteScope for testing.
 *
 * canonPaths: set of protected canonical paths
 * writableByFixer: map from FixTarget to the set of canon paths that fixer can write
 */
function makeCanonScope(
  canonPaths: string[],
  writableByFixer: Array<[FixTarget, string[]]> = [],
): CanonWriteScope {
  return {
    canonPaths: new Set(canonPaths),
    writableByFixer: new Map(writableByFixer.map(([k, v]) => [k, new Set(v)])),
  };
}

/** Canonical paths for SLUG used throughout tests. */
const TEST_CANON_PATHS = [
  `specrunner/changes/${SLUG}/request.md`,
  `specrunner/changes/${SLUG}/spec.md`,
  `specrunner/changes/${SLUG}/design.md`,
  `specrunner/changes/${SLUG}/tasks.md`,
  `specrunner/changes/${SLUG}/test-cases.md`,
  `specrunner/changes/${SLUG}/request-review-attestation.json`,
];

const SPEC_FIXER_WRITABLE = [
  `specrunner/changes/${SLUG}/spec.md`,
  `specrunner/changes/${SLUG}/design.md`,
];

const IMPLEMENTER_WRITABLE = [
  `specrunner/changes/${SLUG}/tasks.md`,
];

function makeFullCanonScope(): CanonWriteScope {
  return makeCanonScope(TEST_CANON_PATHS, [
    ["spec-fixer", SPEC_FIXER_WRITABLE],
    ["implementer", IMPLEMENTER_WRITABLE],
    ["code-fixer", []],
  ]);
}

// ---------------------------------------------------------------------------
// TC-010: selectUnroutableCanonFindings は resolution=fixable 以外を除外する
// ---------------------------------------------------------------------------

describe("TC-010: selectUnroutableCanonFindings — resolution=fixable 以外を除外する", () => {
  it("decision-needed finding（正典パス）は対象外（fixable でないため）", () => {
    // GIVEN: resolution=decision-needed finding on a canon path, with canonScope
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      resolution: "decision-needed",
    });
    const scope = makeFullCanonScope();

    // WHEN: selectUnroutableCanonFindings evaluated
    const result = selectUnroutableCanonFindings([finding], scope, judgeEffectiveFixer);

    // THEN: empty array (resolution is not fixable)
    expect(result).toHaveLength(0);
  });

  it("non-fixable resolution は、ファイルが正典でも対象外", () => {
    const finding: Finding = {
      severity: "high",
      resolution: "decision-needed",
      file: `specrunner/changes/${SLUG}/request.md`,
      title: "Needs operator decision",
      rationale: "This cannot be auto-fixed",
    };
    const scope = makeFullCanonScope();

    const result = selectUnroutableCanonFindings([finding], scope, judgeEffectiveFixer);
    expect(result).toHaveLength(0);
  });

  it("fixable finding は非正典ファイルなら対象外", () => {
    // src/** is not a canon path
    const finding = makeFixableFinding({ file: "src/core/foo.ts" });
    const scope = makeFullCanonScope();

    const result = selectUnroutableCanonFindings([finding], scope, judgeEffectiveFixer);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-011: selectUnroutableCanonFindings は実効 fixer が書ける正典 finding を除外する
// ---------------------------------------------------------------------------

describe("TC-011: selectUnroutableCanonFindings — 実効 fixer が書ける正典 finding を除外する", () => {
  it("spec.md + fixTarget=spec-fixer: spec-fixer は spec.md を書けるため除外", () => {
    // GIVEN: finding on spec.md with fixTarget=spec-fixer, scope has spec-fixer writable = {spec.md}
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/spec.md`,
      resolution: "fixable",
      fixTarget: "spec-fixer",
    });
    const scope = makeFullCanonScope();

    // WHEN: conformanceEffectiveFixer is used (f.fixTarget ?? "implementer")
    const result = selectUnroutableCanonFindings([finding], scope, conformanceEffectiveFixer);

    // THEN: empty (spec-fixer can write spec.md legally)
    expect(result).toHaveLength(0);
  });

  it("design.md + fixTarget=spec-fixer: spec-fixer は design.md を書けるため除外", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/design.md`,
      resolution: "fixable",
      fixTarget: "spec-fixer",
    });
    const scope = makeFullCanonScope();

    const result = selectUnroutableCanonFindings([finding], scope, conformanceEffectiveFixer);
    expect(result).toHaveLength(0);
  });

  it("tasks.md + fixTarget=implementer: implementer は tasks.md を書けるため除外", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/tasks.md`,
      resolution: "fixable",
      fixTarget: "implementer",
    });
    const scope = makeFullCanonScope();

    const result = selectUnroutableCanonFindings([finding], scope, conformanceEffectiveFixer);
    expect(result).toHaveLength(0);
  });

  it("test-cases.md + judgeEffectiveFixer(=code-fixer): code-fixer の writable=∅ なので除外されない（対象に含まれる）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      resolution: "fixable",
    });
    const scope = makeFullCanonScope();

    // judgeEffectiveFixer always returns "code-fixer", code-fixer cannot write test-cases.md
    const result = selectUnroutableCanonFindings([finding], scope, judgeEffectiveFixer);
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe(`specrunner/changes/${SLUG}/test-cases.md`);
  });
});

// ---------------------------------------------------------------------------
// judgeEffectiveFixer / conformanceEffectiveFixer
// ---------------------------------------------------------------------------

describe("judgeEffectiveFixer / conformanceEffectiveFixer", () => {
  it("judgeEffectiveFixer は finding によらず常に code-fixer を返す", () => {
    const f1 = makeFixableFinding({ fixTarget: "spec-fixer" });
    const f2 = makeFixableFinding({ fixTarget: "implementer" });
    const f3 = makeFixableFinding(); // no fixTarget

    expect(judgeEffectiveFixer(f1)).toBe("code-fixer");
    expect(judgeEffectiveFixer(f2)).toBe("code-fixer");
    expect(judgeEffectiveFixer(f3)).toBe("code-fixer");
  });

  it("conformanceEffectiveFixer は f.fixTarget ?? 'implementer' を返す", () => {
    const withCodeFixer = makeFixableFinding({ fixTarget: "code-fixer" });
    const withSpecFixer = makeFixableFinding({ fixTarget: "spec-fixer" });
    const withImplementer = makeFixableFinding({ fixTarget: "implementer" });
    const withoutTarget = makeFixableFinding(); // no fixTarget

    expect(conformanceEffectiveFixer(withCodeFixer)).toBe("code-fixer");
    expect(conformanceEffectiveFixer(withSpecFixer)).toBe("spec-fixer");
    expect(conformanceEffectiveFixer(withImplementer)).toBe("implementer");
    expect(conformanceEffectiveFixer(withoutTarget)).toBe("implementer"); // default
  });
});

// ---------------------------------------------------------------------------
// TC-008: reason に file・title・operator 適用の必要性が含まれる
// TC-012: buildCanonEscalationReason は CANON_FINDING_ESCALATION prefix を含む
// ---------------------------------------------------------------------------

describe("TC-008 / TC-012: buildCanonEscalationReason", () => {
  it("TC-012: 返り値は CANON_FINDING_ESCALATION を含む", () => {
    // GIVEN: finding on test-cases.md with title "Category 誤分類"
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類",
    });

    // WHEN: buildCanonEscalationReason evaluated
    const reason = buildCanonEscalationReason([finding]);

    // THEN: contains CANON_FINDING_ESCALATION prefix
    expect(reason).toContain("CANON_FINDING_ESCALATION");
  });

  it("TC-008: reason は finding.file を含む", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類",
    });

    const reason = buildCanonEscalationReason([finding]);

    // THEN: contains the file path
    expect(reason).toContain(`specrunner/changes/${SLUG}/test-cases.md`);
  });

  it("TC-008: reason は finding.title を含む", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類",
    });

    const reason = buildCanonEscalationReason([finding]);

    // THEN: contains the finding title
    expect(reason).toContain("Category 誤分類");
  });

  it("TC-008: reason は operator の適用が必要である旨を含む", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類",
    });

    const reason = buildCanonEscalationReason([finding]);

    // THEN: contains operator necessity (write-scope violation message)
    // The reason should explain that operator intervention is needed
    const hasOperatorMessage =
      reason.includes("operator") ||
      reason.includes("write-scope") ||
      reason.includes("修正できない") ||
      reason.includes("適用が必要");
    expect(hasOperatorMessage).toBe(true);
  });

  it("複数 finding が含まれる場合、すべての file と title が reason に含まれる", () => {
    const finding1 = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類",
    });
    const finding2 = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/request.md`,
      title: "Request 記述ミス",
    });

    const reason = buildCanonEscalationReason([finding1, finding2]);

    expect(reason).toContain(`specrunner/changes/${SLUG}/test-cases.md`);
    expect(reason).toContain("Category 誤分類");
    expect(reason).toContain(`specrunner/changes/${SLUG}/request.md`);
    expect(reason).toContain("Request 記述ミス");
  });
});
