/**
 * Tests for canon-aware verdict derivation (file-aware escalation routing).
 *
 * TC-001: regression-gate の test-cases.md fixable finding は escalation
 * TC-002: request.md への fixable finding は fixTarget によらず escalation
 * TC-003: 非正典 file への fixable finding は routing 不変
 * TC-004: spec.md への spec-fixer finding は needs-fix:spec-fixer のまま
 * TC-005: tasks.md への implementer finding は needs-fix:implementer のまま
 * TC-006: tasks.md への code-fixer finding は escalation
 * TC-013: canonScope 省略時の deriveJudgeVerdict は現行挙動と同一
 * TC-014: canonScope 省略時の deriveRegressionGateVerdict は現行挙動と同一
 * TC-015: canonScope 省略時の deriveConformanceVerdict は現行挙動と同一
 * TC-016: deriveRegressionGateVerdict が judgeVerdictFn 型に代入可能
 * TC-020: test-cases.md fixable（fixTarget 欠落）→ deriveRegressionGateVerdict escalation（#890 実例）
 * TC-021: tasks.md fixable を deriveJudgeVerdict（実効 fixer=code-fixer）で評価 → escalation
 * TC-022: design.md fixable、fixTarget=spec-fixer → deriveConformanceVerdict needs-fix:spec-fixer
 * TC-027: 破壊確認 — selectUnroutableCanonFindings 無効化で TC-001/TC-002/TC-020 が fail
 *
 * RED: the optional canonScope parameter does not exist in verdict functions yet.
 */
import { describe, it, expect } from "vitest";
import {
  deriveJudgeVerdict,
  deriveRegressionGateVerdict,
  deriveConformanceVerdict,
} from "../../../../src/core/step/judge-verdict.js";
import type { AgentStep } from "../../../../src/core/port/step-types.js";
import type { Finding, FixTarget } from "../../../../src/kernel/report-result.js";
import type { CanonWriteScope } from "../../../../src/core/step/canon-escalation.js";

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
 * Build a realistic CanonWriteScope for the test slug.
 *
 * Mirrors what buildCanonWriteScope(state, deps) will return:
 *   - code-fixer: ∅
 *   - implementer: {tasks.md}
 *   - spec-fixer: {spec.md, design.md, tasks.md}
 */
function makeFullCanonScope(): CanonWriteScope {
  const canonPaths = new Set([
    `specrunner/changes/${SLUG}/request.md`,
    `specrunner/changes/${SLUG}/spec.md`,
    `specrunner/changes/${SLUG}/design.md`,
    `specrunner/changes/${SLUG}/tasks.md`,
    `specrunner/changes/${SLUG}/test-cases.md`,
    `specrunner/changes/${SLUG}/request-review-attestation.json`,
  ]);
  const writableByFixer = new Map<FixTarget, ReadonlySet<string>>([
    ["code-fixer", new Set()],
    ["implementer", new Set([`specrunner/changes/${SLUG}/tasks.md`])],
    ["spec-fixer", new Set([
      `specrunner/changes/${SLUG}/spec.md`,
      `specrunner/changes/${SLUG}/design.md`,
      `specrunner/changes/${SLUG}/tasks.md`,
    ])],
  ]);
  return { canonPaths, writableByFixer };
}

// ---------------------------------------------------------------------------
// TC-001: regression-gate の test-cases.md fixable finding は escalation
// ---------------------------------------------------------------------------

describe("TC-001: deriveRegressionGateVerdict — test-cases.md fixable → escalation", () => {
  it("test-cases.md fixable（fixTarget: code-fixer）→ escalation", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      resolution: "fixable",
      fixTarget: "code-fixer",
    });
    const scope = makeFullCanonScope();

    // With canonScope: code-fixer cannot write test-cases.md → escalation
    const verdict = deriveRegressionGateVerdict([finding], true, undefined, scope);

    expect(verdict).toBe("escalation");
  });

  it("test-cases.md fixable（fixTarget 欠落）→ escalation（実効 fixer=code-fixer）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      resolution: "fixable",
      // fixTarget absent — effective fixer for regression-gate = code-fixer
    });
    const scope = makeFullCanonScope();

    const verdict = deriveRegressionGateVerdict([finding], true, undefined, scope);

    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-002: request.md への fixable finding は fixTarget によらず escalation
// ---------------------------------------------------------------------------

describe("TC-002: request.md fixable finding は fixTarget によらず escalation", () => {
  const fixTargets: Array<FixTarget | undefined> = ["code-fixer", "spec-fixer", "implementer", undefined];

  for (const fixTarget of fixTargets) {
    it(`deriveRegressionGateVerdict — request.md fixable（fixTarget: ${fixTarget ?? "欠落"}）→ escalation`, () => {
      const finding = makeFixableFinding({
        file: `specrunner/changes/${SLUG}/request.md`,
        resolution: "fixable",
        ...(fixTarget !== undefined ? { fixTarget } : {}),
      });
      const scope = makeFullCanonScope();

      // For regression-gate, effective fixer = code-fixer (always)
      // code-fixer cannot write request.md → escalation regardless of fixTarget
      const verdict = deriveRegressionGateVerdict([finding], true, undefined, scope);
      expect(verdict).toBe("escalation");
    });
  }

  it("deriveJudgeVerdict — request.md fixable（fixTarget: code-fixer）→ escalation", () => {
    const finding = makeFixableFinding({
      severity: "high",
      file: `specrunner/changes/${SLUG}/request.md`,
      resolution: "fixable",
      fixTarget: "code-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveJudgeVerdict([finding], true, undefined, scope);
    expect(verdict).toBe("escalation");
  });

  it("deriveConformanceVerdict — request.md fixable（fixTarget: code-fixer）→ escalation", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/request.md`,
      resolution: "fixable",
      fixTarget: "code-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);
    expect(verdict).toBe("escalation");
  });

  it("deriveConformanceVerdict — request.md fixable（fixTarget: spec-fixer）→ escalation（request.md は spec-fixer も書けない）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/request.md`,
      resolution: "fixable",
      fixTarget: "spec-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);
    // spec-fixer's writable = {spec.md, design.md} → request.md is not included → escalation
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-003: 非正典 file への fixable finding は routing 不変
// ---------------------------------------------------------------------------

describe("TC-003: 非正典 file への fixable finding — routing 不変", () => {
  it("deriveJudgeVerdict — src/foo.ts fixable high + canonScope → needs-fix（不変）", () => {
    const finding = makeFixableFinding({
      file: "src/core/foo.ts",
      severity: "high",
      resolution: "fixable",
    });
    const scope = makeFullCanonScope();

    const withScope = deriveJudgeVerdict([finding], true, undefined, scope);
    const withoutScope = deriveJudgeVerdict([finding], true, undefined);

    // Both must be the same: needs-fix
    expect(withScope).toBe("needs-fix");
    expect(withoutScope).toBe("needs-fix");
    expect(withScope).toBe(withoutScope);
  });

  it("deriveRegressionGateVerdict — src/foo.ts fixable + canonScope → needs-fix（不変）", () => {
    const finding = makeFixableFinding({
      file: "src/util/helper.ts",
      severity: "medium",
      resolution: "fixable",
    });
    const scope = makeFullCanonScope();

    const withScope = deriveRegressionGateVerdict([finding], true, undefined, scope);
    const withoutScope = deriveRegressionGateVerdict([finding], true, undefined);

    expect(withScope).toBe("needs-fix");
    expect(withoutScope).toBe("needs-fix");
    expect(withScope).toBe(withoutScope);
  });

  it("deriveConformanceVerdict — src/foo.ts fixable + fixTarget:code-fixer + canonScope → needs-fix:code-fixer（不変）", () => {
    const finding = makeFixableFinding({
      file: "src/adapter/github.ts",
      severity: "high",
      resolution: "fixable",
      fixTarget: "code-fixer",
    });
    const scope = makeFullCanonScope();

    const withScope = deriveConformanceVerdict([finding], true, undefined, scope);
    const withoutScope = deriveConformanceVerdict([finding], true, undefined);

    expect(withScope).toBe("needs-fix:code-fixer");
    expect(withoutScope).toBe("needs-fix:code-fixer");
    expect(withScope).toBe(withoutScope);
  });
});

// ---------------------------------------------------------------------------
// TC-004: spec.md への spec-fixer finding は needs-fix:spec-fixer のまま（挙動保存）
// ---------------------------------------------------------------------------

describe("TC-004: spec.md + fixTarget:spec-fixer → needs-fix:spec-fixer（挙動保存）", () => {
  it("deriveConformanceVerdict — spec.md fixable high fixTarget:spec-fixer + canonScope → needs-fix:spec-fixer", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/spec.md`,
      severity: "high",
      resolution: "fixable",
      fixTarget: "spec-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);

    // spec-fixer can legally write spec.md → needs-fix:spec-fixer preserved
    expect(verdict).toBe("needs-fix:spec-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-005: tasks.md への implementer finding は needs-fix:implementer のまま（挙動保存）
// ---------------------------------------------------------------------------

describe("TC-005: tasks.md + fixTarget:implementer → needs-fix:implementer（挙動保存）", () => {
  it("deriveConformanceVerdict — tasks.md fixable high fixTarget:implementer + canonScope → needs-fix:implementer", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/tasks.md`,
      severity: "high",
      resolution: "fixable",
      fixTarget: "implementer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);

    // implementer can legally write tasks.md → needs-fix:implementer preserved
    expect(verdict).toBe("needs-fix:implementer");
  });
});

// ---------------------------------------------------------------------------
// TC-006: tasks.md への fixer finding の escalation / routing
//   code-fixer → escalation（tasks.md を書けない）
//   spec-fixer → needs-fix:spec-fixer（tasks.md が spec-fixer の write-set に追加）
// ---------------------------------------------------------------------------

describe("TC-006: tasks.md + fixTarget:code-fixer → escalation", () => {
  it("deriveConformanceVerdict — tasks.md fixable high fixTarget:code-fixer + canonScope → escalation", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/tasks.md`,
      severity: "high",
      resolution: "fixable",
      fixTarget: "code-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);

    // code-fixer cannot write tasks.md → escalation
    expect(verdict).toBe("escalation");
  });

  it("deriveConformanceVerdict — tasks.md fixable high fixTarget:spec-fixer + canonScope → needs-fix:spec-fixer", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/tasks.md`,
      severity: "high",
      resolution: "fixable",
      fixTarget: "spec-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);

    // spec-fixer's writable = {spec.md, design.md, tasks.md} → tasks.md included → needs-fix:spec-fixer (D3)
    expect(verdict).toBe("needs-fix:spec-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-013: canonScope 省略時の deriveJudgeVerdict は現行挙動と同一
// ---------------------------------------------------------------------------

describe("TC-013: canonScope 省略時の deriveJudgeVerdict は現行挙動と同一", () => {
  it("正典パスへの high fixable finding + canonScope 省略 → needs-fix（現行挙動、file を参照しない）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      severity: "high",
      resolution: "fixable",
    });

    // No canonScope passed (3-argument form)
    const verdict = deriveJudgeVerdict([finding], true);

    // Without canonScope, the function does not check file → needs-fix (current behavior)
    expect(verdict).toBe("needs-fix");
  });

  it("ok=false → escalation（canonScope 有無に依らず）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
    });

    expect(deriveJudgeVerdict([finding], false)).toBe("escalation");
    expect(deriveJudgeVerdict([finding], false, undefined, makeFullCanonScope())).toBe("escalation");
  });

  it("decision-needed → escalation（canonScope 有無に依らず）", () => {
    const finding: Finding = {
      severity: "low",
      resolution: "decision-needed",
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Decision needed",
      rationale: "Needs human decision",
    };

    expect(deriveJudgeVerdict([finding], true)).toBe("escalation");
    expect(deriveJudgeVerdict([finding], true, undefined, makeFullCanonScope())).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-014: canonScope 省略時の deriveRegressionGateVerdict は現行挙動と同一
// ---------------------------------------------------------------------------

describe("TC-014: canonScope 省略時の deriveRegressionGateVerdict は現行挙動と同一", () => {
  it("正典パスへの fixable finding + canonScope 省略 → needs-fix（現行挙動、file を参照しない）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      resolution: "fixable",
    });

    // No canonScope
    const verdict = deriveRegressionGateVerdict([finding], true);

    // Without canonScope → needs-fix (current behavior, does not look at file)
    expect(verdict).toBe("needs-fix");
  });

  it("空 findings + ok=true → approved（不変）", () => {
    expect(deriveRegressionGateVerdict([], true)).toBe("approved");
    expect(deriveRegressionGateVerdict([], true, undefined, makeFullCanonScope())).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-015: canonScope 省略時の deriveConformanceVerdict は現行挙動と同一
// ---------------------------------------------------------------------------

describe("TC-015: canonScope 省略時の deriveConformanceVerdict は現行挙動と同一", () => {
  it("正典パスへの high fixable fixTarget:code-fixer + canonScope 省略 → needs-fix:code-fixer（現行挙動）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      severity: "high",
      resolution: "fixable",
      fixTarget: "code-fixer",
    });

    // Without canonScope
    const verdict = deriveConformanceVerdict([finding], true);

    expect(verdict).toBe("needs-fix:code-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-016: deriveRegressionGateVerdict が judgeVerdictFn 型に代入可能（型レベルテスト）
// ---------------------------------------------------------------------------

describe("TC-016: deriveRegressionGateVerdict は judgeVerdictFn 型に代入可能", () => {
  it("optional 4th 引数追加後も AgentStep.judgeVerdictFn に代入可能", () => {
    // This test verifies TypeScript assignability at runtime by creating a minimal
    // AgentStep with judgeVerdictFn set to deriveRegressionGateVerdict.
    // If this compiles and runs, the function signature is compatible.
    const step: Pick<AgentStep, "judgeVerdictFn"> = {
      judgeVerdictFn: deriveRegressionGateVerdict,
    };
    // Verify the function can be called through the type
    const findings = [makeFixableFinding({ file: "src/foo.ts" })];
    const verdict = step.judgeVerdictFn!(findings, true);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-020: test-cases.md fixable（fixTarget 欠落）→ deriveRegressionGateVerdict escalation（#890 実例）
// ---------------------------------------------------------------------------

describe("TC-020: #890 実例再現 — test-cases.md fixable（fixTarget 欠落）→ regression-gate escalation", () => {
  it("fixTarget 欠落（実効 fixer=code-fixer）で test-cases.md fixable → escalation", () => {
    // GIVEN: regression-gate finding matching the #890 real case
    // finding.file = test-cases.md, resolution = fixable, fixTarget = absent (missing)
    const finding: Finding = {
      severity: "medium",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類（#890 実例）",
      rationale: "TC の Category フィールドに誤りがある",
      // fixTarget is intentionally absent — default routing would go to code-fixer
    };
    const scope = makeFullCanonScope();

    // WHEN: deriveRegressionGateVerdict with canonScope
    const verdict = deriveRegressionGateVerdict([finding], true, undefined, scope);

    // THEN: escalation (code-fixer cannot write test-cases.md)
    expect(verdict).toBe("escalation");
  });

  it("#890: canonScope なしでは needs-fix になる（旧挙動の確認）", () => {
    const finding: Finding = {
      severity: "medium",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類（#890 実例）",
      rationale: "TC の Category フィールドに誤りがある",
    };

    // Without canonScope: current (broken) behavior returns needs-fix
    const verdict = deriveRegressionGateVerdict([finding], true);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-021: tasks.md fixable を deriveJudgeVerdict（実効 fixer=code-fixer）で評価 → escalation
// ---------------------------------------------------------------------------

describe("TC-021: tasks.md fixable → deriveJudgeVerdict escalation（judge 経路, 実効 fixer=code-fixer）", () => {
  it("tasks.md fixable high + canonScope → escalation（code-fixer は tasks.md を書けない）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/tasks.md`,
      severity: "high",
      resolution: "fixable",
    });
    const scope = makeFullCanonScope();

    // judge path: effective fixer = code-fixer (always)
    const verdict = deriveJudgeVerdict([finding], true, undefined, scope);

    // code-fixer cannot write tasks.md → escalation
    expect(verdict).toBe("escalation");
  });

  it("tasks.md fixable → deriveRegressionGateVerdict escalation（regression-gate 経路も同様）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/tasks.md`,
      resolution: "fixable",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveRegressionGateVerdict([finding], true, undefined, scope);
    expect(verdict).toBe("escalation");
  });
});

// ---------------------------------------------------------------------------
// TC-022: design.md fixable、fixTarget=spec-fixer → deriveConformanceVerdict needs-fix:spec-fixer
// ---------------------------------------------------------------------------

describe("TC-022: design.md fixable fixTarget=spec-fixer → needs-fix:spec-fixer（挙動保存）", () => {
  it("deriveConformanceVerdict — design.md fixable high fixTarget:spec-fixer + canonScope → needs-fix:spec-fixer", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/design.md`,
      severity: "high",
      resolution: "fixable",
      fixTarget: "spec-fixer",
    });
    const scope = makeFullCanonScope();

    const verdict = deriveConformanceVerdict([finding], true, undefined, scope);

    // spec-fixer's writable includes design.md → needs-fix:spec-fixer (preserved)
    expect(verdict).toBe("needs-fix:spec-fixer");
  });
});

// ---------------------------------------------------------------------------
// TC-027: 破壊確認 — selectUnroutableCanonFindings を無効化すると TC-001/TC-002/TC-020 が fail
//
// この「破壊確認」テストは、canon finding check を省略した場合の挙動（需要する verdict が
// needs-fix になること）を明示し、TC-001 / TC-002 / TC-020 の assertions が
// selectUnroutableCanonFindings に依存していることを示す。
//
// 実装: selectUnroutableCanonFindings が常に [] を返す状態は、
// canonScope なしで判定関数を呼んだ場合の挙動と等価（現行の backward-compat パス）。
// ---------------------------------------------------------------------------

describe("TC-027: 破壊確認 — canon check 無効化で TC-001/TC-002/TC-020 の assertions が fail する", () => {
  it("[破壊確認] canon check なし（canonScope 省略）: test-cases.md fixable → needs-fix（escalation でない）", () => {
    // This demonstrates what would happen without the canon check:
    // the verdict is needs-fix instead of escalation
    // → TC-001 assertion (expect escalation) would FAIL in this case
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      resolution: "fixable",
    });

    // Without canonScope (simulates selectUnroutableCanonFindings returning []):
    const verdict = deriveRegressionGateVerdict([finding], true);
    expect(verdict).toBe("needs-fix"); // NOT escalation — proves the check is needed
  });

  it("[破壊確認] canon check なし: request.md fixable → needs-fix（escalation でない）", () => {
    const finding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/request.md`,
      severity: "high",
      resolution: "fixable",
    });

    const verdict = deriveJudgeVerdict([finding], true);
    expect(verdict).toBe("needs-fix"); // NOT escalation without canon check
  });

  it("[破壊確認] #890 実例: canon check なし → needs-fix（escalation でない、バグが再現）", () => {
    const finding: Finding = {
      severity: "medium",
      resolution: "fixable",
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Category 誤分類",
      rationale: "Category フィールドが誤っている",
    };

    // Without canonScope → old broken behavior
    const verdict = deriveRegressionGateVerdict([finding], true);
    expect(verdict).toBe("needs-fix"); // This is the bug; TC-020 expects escalation WITH canon check
  });
});
