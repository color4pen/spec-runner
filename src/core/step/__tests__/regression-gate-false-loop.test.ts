/**
 * Tests for the regression-gate false-loop fix.
 * Change: regression-gate-false-loop
 *
 * TC-001: approved 経路の未修正 low finding は needs-fix にならない
 * TC-002: 既知未修正が全件一致する場合は approved（should）
 * TC-003: 新規検出の退行は needs-fix
 * TC-004: 修正済み finding の退行は needs-fix
 * TC-005: standard reviewer path の routing は low を除外する
 * TC-008: selectFixerTargetFindings は low fixable を除外し high/medium fixable を保持する
 * TC-009: excludeKnownUnfixedRegressions は fingerprint 一致の low ledger エントリで gate finding を除外する
 * TC-010: excludeKnownUnfixedRegressions は fingerprint 不一致の場合は除外しない
 * TC-011: computeRegressionLedger は regression-gate の skipWhen/buildMessage と同一の dedupe 結果を返す（should）
 */
import { describe, it, expect } from "vitest";
import {
  selectFixerTargetFindings,
  deriveRegressionGateVerdict,
} from "../judge-verdict.js";
import {
  excludeKnownUnfixedRegressions,
  computeRegressionLedger,
  collectSpecReviewLedger,
  collectFindingsLedger,
  dedupeFindings,
} from "../../pipeline/findings-ledger.js";
import { collectRoutedFixerFindings } from "../routed-findings.js";
import type { Finding } from "../../../kernel/report-result.js";
import type { JobState, StepRun } from "../../../state/schema.js";
import { STEP_NAMES } from "../step-names.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function f(
  severity: Finding["severity"],
  resolution: Finding["resolution"],
  overrides: Partial<Finding> = {},
): Finding {
  return {
    severity,
    resolution,
    file: "src/foo.ts",
    line: 10,
    title: "T",
    rationale: "R",
    ...overrides,
  };
}

function makeStepRun(findings: Finding[], verdict = "needs-fix"): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T00:00:30Z",
    outcome: {
      verdict: verdict,
      findingsPath: null,
      error: null,
      toolResult: { ok: true, findings },
    },
  };
}

function makeState(
  steps: Record<string, StepRun[]>,
  reviewers?: JobState["reviewers"],
): JobState {
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "s" },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "code-fixer",
    status: "running",
    branch: "feat/s-abc",
    history: [],
    error: null,
    steps,
    ...(reviewers ? { reviewers } : {}),
  };
}

// ---------------------------------------------------------------------------
// TC-008: selectFixerTargetFindings
// ---------------------------------------------------------------------------

describe("TC-008: selectFixerTargetFindings — low fixable を除外し high/medium fixable を保持する", () => {
  it("TC-008: high fixable は保持される", () => {
    // TC-008: selectFixerTargetFindings は low fixable を除外し high/medium fixable を保持する
    const findings: Finding[] = [
      f("low", "fixable", { file: "src/a.ts", title: "LOW" }),
      f("high", "fixable", { file: "src/b.ts", title: "HIGH" }),
      f("medium", "fixable", { file: "src/c.ts", title: "MED" }),
      f("low", "decision-needed", { file: "src/d.ts", title: "LOW-DN" }),
    ];
    const result = selectFixerTargetFindings(findings);
    expect(result.map((x: Finding) => x.title)).toContain("HIGH");
    expect(result.map((x: Finding) => x.title)).toContain("MED");
    expect(result.map((x: Finding) => x.title)).not.toContain("LOW");
    // decision-needed は fixable でないため除外
    expect(result.map((x: Finding) => x.title)).not.toContain("LOW-DN");
  });

  it("TC-008: low fixable のみの場合は空配列", () => {
    const findings: Finding[] = [
      f("low", "fixable"),
      f("low", "fixable", { file: "src/b.ts", title: "LOW2" }),
    ];
    const result = selectFixerTargetFindings(findings);
    expect(result).toHaveLength(0);
  });

  it("TC-008: critical fixable は保持される", () => {
    const result = selectFixerTargetFindings([f("critical", "fixable")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe("critical");
  });

  it("TC-008: 空配列は空配列を返す", () => {
    expect(selectFixerTargetFindings([])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-009: excludeKnownUnfixedRegressions — fingerprint 一致で除外
// ---------------------------------------------------------------------------

describe("TC-009: excludeKnownUnfixedRegressions — fingerprint 一致の low ledger エントリで gate finding を除外する", () => {
  it("TC-009: gate finding と ledger low エントリの fingerprint が一致 → 除外して [] を返す", () => {
    // TC-009 spec exact fixture
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "A.ts", line: 10, title: "T" }),
    ];
    const ledger: Finding[] = [
      f("low", "fixable", { file: "A.ts", line: 10, title: "T" }),
    ];
    const result = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(result).toEqual([]);
  });

  it("TC-009: ledger に複数の low エントリが一致 → すべて除外", () => {
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "A.ts", line: 1, title: "X" }),
      f("high", "fixable", { file: "B.ts", line: 2, title: "Y" }),
    ];
    const ledger: Finding[] = [
      f("low", "fixable", { file: "A.ts", line: 1, title: "X" }),
      f("low", "fixable", { file: "B.ts", line: 2, title: "Y" }),
    ];
    const result = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(result).toHaveLength(0);
  });

  it("TC-009: line が undefined の場合でも fingerprint が一致すれば除外", () => {
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "A.ts", line: undefined, title: "NoLine" }),
    ];
    const ledger: Finding[] = [
      f("low", "fixable", { file: "A.ts", line: undefined, title: "NoLine" }),
    ];
    const result = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-010: excludeKnownUnfixedRegressions — fingerprint 不一致で除外しない
// ---------------------------------------------------------------------------

describe("TC-010: excludeKnownUnfixedRegressions — fingerprint 不一致の場合は除外しない", () => {
  it("TC-010: file が異なる → 除外しない（gate finding はそのまま返る）", () => {
    // TC-010 spec exact fixture
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "B.ts", line: 1, title: "T" }),
    ];
    const ledger: Finding[] = [
      f("low", "fixable", { file: "A.ts", line: 1, title: "T" }),
    ];
    const result = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(result).toHaveLength(1);
    expect(result[0]!.file).toBe("B.ts");
  });

  it("TC-010: ledger が空 → gate finding をそのまま返す", () => {
    const gateFindings: Finding[] = [f("high", "fixable")];
    const result = excludeKnownUnfixedRegressions(gateFindings, []);
    expect(result).toEqual(gateFindings);
  });

  it("TC-010: gate findings が空 → 空配列を返す", () => {
    const ledger: Finding[] = [f("low", "fixable")];
    const result = excludeKnownUnfixedRegressions([], ledger);
    expect(result).toHaveLength(0);
  });

  it("TC-010: ledger に medium エントリのみ（既知未修正集合は low のみ） → 除外しない", () => {
    // medium ledger エントリは既知未修正集合（low のみ）に含まれないため除外対象外
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "A.ts", line: 1, title: "M" }),
    ];
    const ledger: Finding[] = [
      f("medium", "fixable", { file: "A.ts", line: 1, title: "M" }),
    ];
    const result = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-001: approved 経路の未修正 low finding は needs-fix にならない（再現テスト）
// ---------------------------------------------------------------------------

describe("TC-001: approved 経路の未修正 low finding は needs-fix にならない", () => {
  it("TC-001: ledger に low fixable L、gate が L と同一 fingerprint を報告 → approved（ループしない）", () => {
    // TC-001: 再現テスト
    // ledger: low fixable エントリ L（reviewer が approved 時に one-shot routing、code-fixer が修正せず残存）
    const ledger: Finding[] = [
      f("low", "fixable", { file: "src/auth.ts", line: 42, title: "Leaked cred" }),
    ];
    // gate agent: L と同一 fingerprint の退行を high/fixable で報告（gate は severity=high で報告する）
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/auth.ts", line: 42, title: "Leaked cred" }),
    ];
    // excludeKnownUnfixedRegressions が low ledger エントリと一致 → 除外
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("approved");
  });

  it("TC-001: 複数の low finding が全て除外 → approved", () => {
    const ledger: Finding[] = [
      f("low", "fixable", { file: "src/a.ts", line: 1, title: "A" }),
      f("low", "fixable", { file: "src/b.ts", line: 2, title: "B" }),
    ];
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/a.ts", line: 1, title: "A" }),
      f("high", "fixable", { file: "src/b.ts", line: 2, title: "B" }),
    ];
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-002: 既知未修正が全件一致する場合は approved（should）
// ---------------------------------------------------------------------------

describe("TC-002: 既知未修正が全件一致する場合は approved", () => {
  it("TC-002: gate findings が全て既知未修正集合に一致 → verdictFindings が空 → approved", () => {
    // TC-002: Scenario: 既知未修正が無ければ空 ledger と同じく approved
    const ledger: Finding[] = [
      f("low", "fixable", { file: "src/x.ts", line: 5, title: "X" }),
      f("low", "fixable", { file: "src/y.ts", line: 6, title: "Y" }),
    ];
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/x.ts", line: 5, title: "X" }),
      f("high", "fixable", { file: "src/y.ts", line: 6, title: "Y" }),
    ];
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(verdictFindings).toHaveLength(0);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("approved");
  });
});

// ---------------------------------------------------------------------------
// TC-003: 新規検出の退行は needs-fix
// ---------------------------------------------------------------------------

describe("TC-003: 新規検出の退行は needs-fix", () => {
  it("TC-003: gate finding F の fingerprint が ledger low エントリとも一致しない → needs-fix", () => {
    // TC-003: Scenario: 新規検出の退行は needs-fix
    const ledger: Finding[] = [
      f("low", "fixable", { file: "src/a.ts", line: 1, title: "KNOWN" }),
    ];
    // 新規退行: fingerprint が ledger と一致しない
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/NEW.ts", line: 99, title: "NEW" }),
    ];
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(verdictFindings).toHaveLength(1);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-003: ledger が空（custom reviewer なし）でも gate finding があれば needs-fix", () => {
    const gateFindings: Finding[] = [f("high", "fixable")];
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, []);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-003: 一部が既知未修正集合に一致し、残りが新規 → needs-fix", () => {
    const ledger: Finding[] = [
      f("low", "fixable", { file: "src/a.ts", line: 1, title: "KNOWN" }),
    ];
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/a.ts", line: 1, title: "KNOWN" }), // 除外される
      f("high", "fixable", { file: "src/b.ts", line: 2, title: "NEW" }),   // 残る → needs-fix
    ];
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(verdictFindings).toHaveLength(1);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-004: 修正済み finding の退行は needs-fix
// ---------------------------------------------------------------------------

describe("TC-004: 修正済み finding の退行は needs-fix", () => {
  it("TC-004: ledger に medium fixable M、gate が M と同一 fingerprint → medium は既知未修正集合外（low のみ）→ needs-fix", () => {
    // TC-004: Scenario: 修正済み finding の退行は needs-fix
    // ledger の medium エントリは既知未修正集合（low のみ）に含まれない → 除外されない → needs-fix
    const ledger: Finding[] = [
      f("medium", "fixable", { file: "src/m.ts", line: 20, title: "M" }),
    ];
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/m.ts", line: 20, title: "M" }),
    ];
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    // medium ledger エントリは既知未修正集合に含まれないため除外されない
    expect(verdictFindings).toHaveLength(1);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("needs-fix");
  });

  it("TC-004: high ledger エントリの fingerprint 一致 → 除外されない → needs-fix", () => {
    const ledger: Finding[] = [
      f("high", "fixable", { file: "src/h.ts", line: 5, title: "H" }),
    ];
    const gateFindings: Finding[] = [
      f("high", "fixable", { file: "src/h.ts", line: 5, title: "H" }),
    ];
    // high ledger エントリは既知未修正集合（low のみ）に含まれない
    const verdictFindings = excludeKnownUnfixedRegressions(gateFindings, ledger);
    expect(verdictFindings).toHaveLength(1);
    const verdict = deriveRegressionGateVerdict(verdictFindings, true);
    expect(verdict).toBe("needs-fix");
  });
});

// ---------------------------------------------------------------------------
// TC-005: standard reviewer path の routing は low を除外する
// ---------------------------------------------------------------------------

describe("TC-005: standard reviewer path の routing は low を除外する", () => {
  it("TC-005: active reviewer に low+fixable と high+fixable → routing は high のみ返す", () => {
    // TC-005: Scenario: standard reviewer path の routing は low を除外する
    // Branch 3 of collectRoutedFixerFindings
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        makeStepRun([
          f("low", "fixable", { file: "src/low.ts", title: "LOW" }),
          f("high", "fixable", { file: "src/high.ts", title: "HIGH" }),
        ]),
      ],
    });
    const findings = collectRoutedFixerFindings(state);
    const titles = findings.map((x) => x.title);
    expect(titles).toContain("HIGH");
    expect(titles).not.toContain("LOW");
  });

  it("TC-005: low のみの場合、routing は空を返す", () => {
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        makeStepRun([
          f("low", "fixable", { file: "src/low1.ts", title: "L1" }),
          f("low", "fixable", { file: "src/low2.ts", title: "L2" }),
        ]),
      ],
    });
    const findings = collectRoutedFixerFindings(state);
    expect(findings).toHaveLength(0);
  });

  it("TC-005: medium fixable は routing に含まれる（low のみ除外）", () => {
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        makeStepRun([
          f("medium", "fixable", { file: "src/med.ts", title: "MED" }),
          f("low", "fixable", { file: "src/low.ts", title: "LOW" }),
        ]),
      ],
    });
    const findings = collectRoutedFixerFindings(state);
    const titles = findings.map((x) => x.title);
    expect(titles).toContain("MED");
    expect(titles).not.toContain("LOW");
  });
});

// ---------------------------------------------------------------------------
// TC-011: computeRegressionLedger は skipWhen/buildMessage と同一の dedupe 結果を返す（should）
// ---------------------------------------------------------------------------

describe("TC-011: computeRegressionLedger は regression-gate の skipWhen/buildMessage と同一の dedupe 結果を返す", () => {
  it("TC-011: spec-review + impl reviewer findings を dedupeFindings で合成した結果と一致する", () => {
    const specFinding = f("high", "fixable", { file: "specrunner/changes/s/spec.md", title: "SpecIssue" });
    const implFinding = f("medium", "fixable", { file: "src/impl.ts", title: "ImplIssue" });

    const state = makeState({
      [STEP_NAMES.SPEC_REVIEW]: [makeStepRun([specFinding])],
      "code-review": [makeStepRun([implFinding])],
    });
    const reviewerChain = ["code-review"];

    // computeRegressionLedger の期待値: manual 合成と一致
    const expected = dedupeFindings([
      ...collectSpecReviewLedger(state),
      ...collectFindingsLedger(reviewerChain, state),
    ]);

    const actual = computeRegressionLedger(reviewerChain, state);

    expect(actual).toHaveLength(expected.length);
    // fingerprint で同一かを確認
    const actualKeys = actual.map((f2: Finding) => `${f2.file}|${f2.line ?? ""}|${f2.title}`).sort();
    const expectedKeys = expected.map((f2: Finding) => `${f2.file}|${f2.line ?? ""}|${f2.title}`).sort();
    expect(actualKeys).toEqual(expectedKeys);
  });

  it("TC-011: 重複する finding は 1 件にまとめられる", () => {
    const dup = f("high", "fixable", { file: "src/dup.ts", line: 1, title: "DUP" });

    const state = makeState({
      [STEP_NAMES.SPEC_REVIEW]: [makeStepRun([dup])],
      "code-review": [makeStepRun([dup])],
    });
    const reviewerChain = ["code-review"];

    const actual = computeRegressionLedger(reviewerChain, state);
    expect(actual).toHaveLength(1);
  });

  it("TC-011: reviewerChain が空、spec-review もなし → 空配列", () => {
    const state = makeState({});
    const actual = computeRegressionLedger([], state);
    expect(actual).toHaveLength(0);
  });
});
