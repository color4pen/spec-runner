/**
 * Tests for the regression-gate false-loop fix.
 * Change: regression-gate-false-loop
 *
 * TC-005: standard reviewer path の routing は low を含む
 * TC-008: selectFixerTargetFindings は全 severity の fixable を保持する（low 除外なし）
 * TC-011: computeRegressionLedger は regression-gate の skipWhen/buildMessage と同一の dedupe 結果を返す（should）
 *
 * 削除済み (severity-fixability-split / D1 / D2 による):
 * TC-001: excludeKnownUnfixedRegressions 廃止に伴い削除
 * TC-002: 同上
 * TC-003: judge-verdict.test.ts の deriveRegressionGateVerdict でカバー済みのため削除
 * TC-004: 同上
 * TC-009: excludeKnownUnfixedRegressions 削除に伴い削除
 * TC-010: 同上
 */
import { describe, it, expect } from "vitest";
import {
  selectFixerTargetFindings,
} from "../judge-verdict.js";
import {
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
// TC-008: selectFixerTargetFindings — 全 severity の fixable を保持（low 除外なし）
// ---------------------------------------------------------------------------

describe("TC-008: selectFixerTargetFindings — all fixable severities are included (no LOW exclusion)", () => {
  it("TC-008: high / medium / low fixable はすべて保持される", () => {
    // D1: LOW も含む全 fixable が返る
    const findings: Finding[] = [
      f("low", "fixable", { file: "src/a.ts", title: "LOW" }),
      f("high", "fixable", { file: "src/b.ts", title: "HIGH" }),
      f("medium", "fixable", { file: "src/c.ts", title: "MED" }),
      f("low", "decision-needed", { file: "src/d.ts", title: "LOW-DN" }),
    ];
    const result = selectFixerTargetFindings(findings);
    expect(result.map((x: Finding) => x.title)).toContain("HIGH");
    expect(result.map((x: Finding) => x.title)).toContain("MED");
    expect(result.map((x: Finding) => x.title)).toContain("LOW");
    // decision-needed は fixable でないため除外
    expect(result.map((x: Finding) => x.title)).not.toContain("LOW-DN");
  });

  it("TC-008: low fixable のみの場合は LOW 全件を返す（空でない）", () => {
    // D1: only-LOW は空でなく LOW 全件を返す
    const findings: Finding[] = [
      f("low", "fixable"),
      f("low", "fixable", { file: "src/b.ts", title: "LOW2" }),
    ];
    const result = selectFixerTargetFindings(findings);
    expect(result).toHaveLength(2);
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
// TC-005: standard reviewer path の routing は全 fixable を含む（low も含む）
// ---------------------------------------------------------------------------

describe("TC-005: standard reviewer path の routing は low を含む全 fixable を返す", () => {
  it("TC-005: active reviewer に low+fixable と high+fixable → routing は HIGH も LOW も返す", () => {
    // D1: LOW も含む前提へ更新
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
    expect(titles).toContain("LOW");
  });

  it("TC-005: low のみの場合、routing は LOW 全件を返す（空でない）", () => {
    // D1: only-LOW は空でなく LOW 全件を返す
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        makeStepRun([
          f("low", "fixable", { file: "src/low1.ts", title: "L1" }),
          f("low", "fixable", { file: "src/low2.ts", title: "L2" }),
        ]),
      ],
    });
    const findings = collectRoutedFixerFindings(state);
    expect(findings).toHaveLength(2);
  });

  it("TC-005: medium fixable は routing に含まれる", () => {
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
    expect(titles).toContain("LOW");
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
