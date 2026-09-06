/**
 * Tests for canon-escalation.ts pure functions.
 *
 * TC-008: reason に file・title・operator 適用の必要性が含まれる
 * TC-010: selectUnroutableCanonFindings は resolution=fixable 以外を除外する
 * TC-011: selectUnroutableCanonFindings は実効 fixer が書ける正典 finding を除外する
 * TC-012: buildCanonEscalationReason は CANON_FINDING_ESCALATION prefix を含む
 * TC-030: 主 site canon + 副 site src/** + spec-fixer → unroutable (non-canon secondary not in broadWriteFixers)
 * TC-031: 主 file 非 canon + 副 site 保護 canon + spec-fixer → unroutable
 * TC-032: 全 site writable (spec-fixer) → routable
 * TC-033: legacy finding (remediation なし) は従来どおりの挙動を維持する
 * TC-034: code-fixer + non-canon secondary site (remediation) → NOT unroutable (broad write)
 * TC-035: isFindingWithinFixerWriteScope is exported from canon-escalation.ts
 */
import { describe, it, expect } from "vitest";
import {
  selectUnroutableCanonFindings,
  selectRoutableCanonFindings,
  buildCanonEscalationReason,
  judgeEffectiveFixer,
  conformanceEffectiveFixer,
  specReviewEffectiveFixer,
  type CanonWriteScope,
} from "../../../../src/core/step/canon-escalation.js";
import * as canonEscalationNS from "../../../../src/core/step/canon-escalation.js";
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
 * broadWriteFixers: optional set of fixers with broad non-canon write access
 */
function makeCanonScope(
  canonPaths: string[],
  writableByFixer: Array<[FixTarget, string[]]> = [],
  broadWriteFixers?: FixTarget[],
): CanonWriteScope {
  return {
    canonPaths: new Set(canonPaths),
    writableByFixer: new Map(writableByFixer.map(([k, v]) => [k, new Set(v)])),
    ...(broadWriteFixers !== undefined ? { broadWriteFixers: new Set(broadWriteFixers) } : {}),
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

// ---------------------------------------------------------------------------
// TC-035: isFindingWithinFixerWriteScope is exported from canon-escalation.ts
// ---------------------------------------------------------------------------

describe("TC-035: isFindingWithinFixerWriteScope is exported", () => {
  it("TC-035: isFindingWithinFixerWriteScope is a function export", () => {
    const fn = (canonEscalationNS as Record<string, unknown>).isFindingWithinFixerWriteScope;
    expect(fn).toBeDefined();
    expect(typeof fn).toBe("function");
  });
});

// ---------------------------------------------------------------------------
// TC-030: 主 site canon (spec-fixer writable) + 副 site src/** + spec-fixer → unroutable
// Operator 裁定: spec-fixer の change-folder write set 外の site (src/**) を持つ finding は
// fail-closed に escalation する。
// ---------------------------------------------------------------------------

describe("TC-030: 主 site spec.md + 副 site src/** + spec-fixer → unroutable", () => {
  const SPEC_MD = `specrunner/changes/${SLUG}/spec.md`;
  const DESIGN_MD = `specrunner/changes/${SLUG}/design.md`;

  function makeScopeWithBroad(): CanonWriteScope {
    return makeCanonScope(
      TEST_CANON_PATHS,
      [
        ["spec-fixer", [SPEC_MD, DESIGN_MD]],
        ["implementer", [`specrunner/changes/${SLUG}/tasks.md`]],
        ["code-fixer", []],
      ],
      ["code-fixer", "implementer"], // broadWriteFixers
    );
  }

  it("TC-030: spec.md primary + src/** secondary + spec-fixer → unroutable (spec-fixer cannot write non-canon)", () => {
    const finding = makeFixableFinding({
      file: SPEC_MD,
      resolution: "fixable",
      remediation: {
        invariant: "Spec and implementation must stay in sync",
        sites: [
          { file: SPEC_MD },
          { file: "src/core/foo.ts" }, // non-canon, spec-fixer cannot write
        ],
        approach: "Fix spec and update implementation",
      },
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(1);
    expect(unroutable[0]?.file).toBe(SPEC_MD);
  });

  it("TC-030: the same finding is NOT in selectRoutableCanonFindings (complement holds)", () => {
    const finding = makeFixableFinding({
      file: SPEC_MD,
      resolution: "fixable",
      remediation: {
        invariant: "Spec and implementation must stay in sync",
        sites: [
          { file: SPEC_MD },
          { file: "src/core/foo.ts" },
        ],
        approach: "Fix spec and update implementation",
      },
    });
    const scope = makeScopeWithBroad();

    const routable = selectRoutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(routable).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-031: 主 file 非 canon + 副 site 保護 canon + spec-fixer → unroutable
// ---------------------------------------------------------------------------

describe("TC-031: 主 file 非 canon + 副 site 保護 canon + spec-fixer → unroutable", () => {
  const SPEC_MD = `specrunner/changes/${SLUG}/spec.md`;
  const REQUEST_MD = `specrunner/changes/${SLUG}/request.md`;

  function makeScopeWithBroad(): CanonWriteScope {
    return makeCanonScope(
      TEST_CANON_PATHS,
      [
        ["spec-fixer", [SPEC_MD, `specrunner/changes/${SLUG}/design.md`]],
        ["implementer", [`specrunner/changes/${SLUG}/tasks.md`]],
        ["code-fixer", []],
      ],
      ["code-fixer", "implementer"],
    );
  }

  it("TC-031: non-canon primary + protected canon secondary (request.md) + spec-fixer → unroutable", () => {
    // Primary file is src/** (non-canon), secondary site is request.md (canon, not writable by spec-fixer)
    const finding = makeFixableFinding({
      file: "src/handler.ts", // non-canon
      resolution: "fixable",
      remediation: {
        invariant: "Handler must reflect request spec",
        sites: [
          { file: "src/handler.ts" },
          { file: REQUEST_MD }, // canon, NOT in spec-fixer's writable set
        ],
        approach: "Update handler and fix request spec",
      },
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(1);
  });

  it("TC-031: non-canon primary + non-canon secondary + spec-fixer → unroutable (spec-fixer not in broadWriteFixers)", () => {
    // Both primary and secondary are non-canon; spec-fixer cannot write either
    const finding = makeFixableFinding({
      file: "src/foo.ts",
      resolution: "fixable",
      remediation: {
        invariant: "foo and bar must agree",
        sites: [
          { file: "src/foo.ts" },
          { file: "src/bar.ts" },
        ],
        approach: "Fix both files",
      },
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-032: 全 site writable (spec-fixer) → routable
// ---------------------------------------------------------------------------

describe("TC-032: 全 site writable なら routable", () => {
  const SPEC_MD = `specrunner/changes/${SLUG}/spec.md`;
  const DESIGN_MD = `specrunner/changes/${SLUG}/design.md`;
  const TASKS_MD = `specrunner/changes/${SLUG}/tasks.md`;

  function makeScopeWithBroad(): CanonWriteScope {
    return makeCanonScope(
      TEST_CANON_PATHS,
      [
        ["spec-fixer", [SPEC_MD, DESIGN_MD, TASKS_MD]],
        ["implementer", [TASKS_MD]],
        ["code-fixer", []],
      ],
      ["code-fixer", "implementer"],
    );
  }

  it("TC-032: all canon sites writable by spec-fixer → routable (not in unroutable)", () => {
    const finding = makeFixableFinding({
      file: SPEC_MD,
      resolution: "fixable",
      remediation: {
        invariant: "spec.md and design.md must stay coherent",
        sites: [
          { file: SPEC_MD },
          { file: DESIGN_MD },
          { file: TASKS_MD },
        ],
        approach: "Fix spec, design, and tasks together",
      },
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(0);

    const routable = selectRoutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(routable).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-033: legacy finding (remediation なし) は従来どおりの挙動を維持する
// ---------------------------------------------------------------------------

describe("TC-033: legacy finding (no remediation) — behavior unchanged", () => {
  const SPEC_MD = `specrunner/changes/${SLUG}/spec.md`;
  const REQUEST_MD = `specrunner/changes/${SLUG}/request.md`;

  function makeScopeWithBroad(): CanonWriteScope {
    return makeCanonScope(
      TEST_CANON_PATHS,
      [
        ["spec-fixer", [SPEC_MD, `specrunner/changes/${SLUG}/design.md`]],
        ["code-fixer", []],
      ],
      ["code-fixer", "implementer"],
    );
  }

  it("TC-033: legacy canon finding on spec.md + spec-fixer → not unroutable (writable)", () => {
    const finding = makeFixableFinding({
      file: SPEC_MD,
      resolution: "fixable",
      // no remediation
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(0);
  });

  it("TC-033: legacy canon finding on request.md + spec-fixer → unroutable (not in writable set)", () => {
    const finding = makeFixableFinding({
      file: REQUEST_MD,
      resolution: "fixable",
      // no remediation
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(1);
  });

  it("TC-033: legacy non-canon finding (src/**) + spec-fixer → NOT unroutable (pass-through)", () => {
    const finding = makeFixableFinding({
      file: "src/core/foo.ts", // non-canon, no remediation
      resolution: "fixable",
    });
    const scope = makeScopeWithBroad();

    // Legacy: non-canon primary without remediation → pass-through (neither routable nor unroutable)
    const unroutable = selectUnroutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(unroutable).toHaveLength(0);

    const routable = selectRoutableCanonFindings([finding], scope, specReviewEffectiveFixer);
    expect(routable).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-034: code-fixer + non-canon secondary site (remediation) → NOT unroutable (broad write)
// ---------------------------------------------------------------------------

describe("TC-034: code-fixer + non-canon secondary site (remediation) → NOT unroutable", () => {
  const SPEC_MD = `specrunner/changes/${SLUG}/spec.md`;

  function makeScopeWithBroad(): CanonWriteScope {
    return makeCanonScope(
      TEST_CANON_PATHS,
      [
        ["spec-fixer", [SPEC_MD, `specrunner/changes/${SLUG}/design.md`]],
        ["code-fixer", []],
        ["implementer", [`specrunner/changes/${SLUG}/tasks.md`]],
      ],
      ["code-fixer", "implementer"],
    );
  }

  it("TC-034: code-fixer + non-canon primary + non-canon secondary → not unroutable (broadWriteFixers)", () => {
    const finding = makeFixableFinding({
      file: "src/foo.ts",
      resolution: "fixable",
      remediation: {
        invariant: "foo and bar must agree",
        sites: [
          { file: "src/foo.ts" },
          { file: "src/bar.ts" },
        ],
        approach: "Fix both",
      },
    });
    const scope = makeScopeWithBroad();

    // code-fixer is in broadWriteFixers → can write non-canon files
    const unroutable = selectUnroutableCanonFindings([finding], scope, judgeEffectiveFixer);
    expect(unroutable).toHaveLength(0);
  });

  it("TC-034: implementer + non-canon primary + non-canon secondary → not unroutable (broadWriteFixers)", () => {
    const finding = makeFixableFinding({
      file: "src/handler.ts",
      resolution: "fixable",
      fixTarget: "implementer",
      remediation: {
        invariant: "handler and model must align",
        sites: [
          { file: "src/handler.ts" },
          { file: "src/model.ts" },
        ],
        approach: "Align both",
      },
    });
    const scope = makeScopeWithBroad();

    const unroutable = selectUnroutableCanonFindings([finding], scope, conformanceEffectiveFixer);
    expect(unroutable).toHaveLength(0);
  });
});
