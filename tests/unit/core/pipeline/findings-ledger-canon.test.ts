/**
 * Tests for canon-aware findings-ledger functions.
 *
 * TC-007: 正典 finding を含む reviewer round の後、code-fixer は正典 finding を受領しない
 * TC-025: collectFindingsLedger は canonScope 省略時に現行挙動と同一
 * TC-026: collectParallelFixerFindings は canonScope 省略時に現行挙動と同一
 * TC-028: 破壊確認 — collectParallelFixerFindings の除外削除で TC-007 が fail
 *
 * RED: the optional canonScope parameter does not exist in ledger functions yet.
 */
import { describe, it, expect } from "vitest";
import {
  collectFindingsLedger,
  collectParallelFixerFindings,
} from "../../../../src/core/pipeline/findings-ledger.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
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
    title: "Default finding",
    rationale: "Fix this",
    ...overrides,
  };
}

function makeState(steps: Record<string, Partial<StepRun>[]> = {}): JobState {
  const stepsTyped: Record<string, StepRun[]> = {};
  for (const [key, runs] of Object.entries(steps)) {
    stepsTyped[key] = runs.map((r, i) => ({
      attempt: i + 1,
      sessionId: null,
      startedAt: `2026-01-01T00:0${i}:00Z`,
      endedAt: `2026-01-01T00:0${i}:30Z`,
      outcome: {
        verdict: r.outcome?.verdict ?? null,
        findingsPath: r.outcome?.findingsPath ?? null,
        error: null,
        toolResult: r.outcome?.toolResult ?? undefined,
      },
    }));
  }
  return {
    version: 2,
    jobId: "test-job",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    request: { path: `specrunner/changes/${SLUG}/request.md`, title: "T", type: "bug-fix", slug: SLUG },
    repository: { owner: "o", name: "r" },
    session: null,
    step: "code-review",
    status: "running",
    branch: null,
    history: [],
    error: null,
    steps: stepsTyped,
  };
}

/**
 * Build a realistic CanonWriteScope for the test slug.
 * Mirrors what buildCanonWriteScope(state, deps) will return.
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
    ])],
  ]);
  return { canonPaths, writableByFixer };
}

// ---------------------------------------------------------------------------
// TC-007: 正典 finding を含む reviewer round の後、code-fixer は正典 finding を受領しない
// ---------------------------------------------------------------------------

describe("TC-007: collectParallelFixerFindings — 正典 finding は canonScope 付きで除外される", () => {
  it("test-cases.md fixable finding は canonScope 付きで除外される", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon finding (test-cases.md)",
    });
    const normalFinding = makeFixableFinding({
      file: "src/core/foo.ts",
      title: "Normal finding (src/**)",
    });

    const state = makeState({
      "custom-reviewer": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding, normalFinding] },
          },
        },
      ],
    });

    const scope = makeFullCanonScope();

    // WHEN: collectParallelFixerFindings with canonScope
    const result = collectParallelFixerFindings(state, ["custom-reviewer"], scope);

    // THEN: canon finding is excluded, normal finding is included
    const titles = result.map((f) => f.title);
    expect(titles).not.toContain("Canon finding (test-cases.md)");
    expect(titles).toContain("Normal finding (src/**)");
  });

  it("request.md fixable finding は canonScope 付きで除外される", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/request.md`,
      title: "Request canon finding",
    });

    const state = makeState({
      "code-review": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding] },
          },
        },
      ],
    });

    const scope = makeFullCanonScope();
    const result = collectParallelFixerFindings(state, ["code-review"], scope);

    expect(result).toHaveLength(0);
  });

  it("正典 finding のみの場合、出力は空配列", () => {
    const canonFinding1 = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon 1",
    });
    const canonFinding2 = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/request.md`,
      title: "Canon 2",
    });

    const state = makeState({
      "custom-reviewer": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding1, canonFinding2] },
          },
        },
      ],
    });

    const scope = makeFullCanonScope();
    const result = collectParallelFixerFindings(state, ["custom-reviewer"], scope);

    expect(result).toHaveLength(0);
  });
});

describe("TC-007: collectFindingsLedger — 正典 finding は canonScope 付きで除外される", () => {
  it("test-cases.md fixable は collectFindingsLedger から除外される", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon finding in ledger",
    });
    const normalFinding = makeFixableFinding({
      file: "src/core/bar.ts",
      title: "Normal finding in ledger",
    });

    const state = makeState({
      "code-review": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding, normalFinding] },
          },
        },
      ],
    });

    const scope = makeFullCanonScope();

    // WHEN: collectFindingsLedger with canonScope
    const ledger = collectFindingsLedger(["code-review"], state, scope);

    // THEN: canon finding excluded, normal finding present
    const titles = ledger.map((f) => f.title);
    expect(titles).not.toContain("Canon finding in ledger");
    expect(titles).toContain("Normal finding in ledger");
  });

  it("正典 finding のみの ledger は canonScope 付きで空になる", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon-only finding",
    });

    const state = makeState({
      "regression-gate": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding] },
          },
        },
      ],
    });

    const scope = makeFullCanonScope();
    const ledger = collectFindingsLedger(["regression-gate"], state, scope);

    expect(ledger).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-025: collectFindingsLedger は canonScope 省略時に現行挙動と同一
// ---------------------------------------------------------------------------

describe("TC-025: collectFindingsLedger — canonScope 省略時に現行挙動と同一", () => {
  it("正典 finding を含む state + canonScope 省略 → finding は除外されない（現行挙動）", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon finding (not excluded without scope)",
    });

    const state = makeState({
      "code-review": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding] },
          },
        },
      ],
    });

    // Without canonScope (2-argument form)
    const ledger = collectFindingsLedger(["code-review"], state);

    // Without canonScope, the finding is NOT excluded (current behavior)
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.file).toBe(`specrunner/changes/${SLUG}/test-cases.md`);
  });

  it("canonScope なし → 非正典 finding は現行通り収集される", () => {
    const normalFinding = makeFixableFinding({
      file: "src/core/foo.ts",
      title: "Normal finding",
    });

    const state = makeState({
      "code-review": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [normalFinding] },
          },
        },
      ],
    });

    const ledger = collectFindingsLedger(["code-review"], state);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]?.file).toBe("src/core/foo.ts");
  });
});

// ---------------------------------------------------------------------------
// TC-026: collectParallelFixerFindings は canonScope 省略時に現行挙動と同一
// ---------------------------------------------------------------------------

describe("TC-026: collectParallelFixerFindings — canonScope 省略時に現行挙動と同一", () => {
  it("正典 finding を含む state + canonScope 省略 → finding は除外されない（現行挙動）", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon finding (not excluded without scope)",
    });

    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding] },
          },
        },
      ],
    });

    // Without canonScope (2-argument form)
    const result = collectParallelFixerFindings(state, ["A"]);

    // Without canonScope, the canon finding is NOT excluded
    expect(result).toHaveLength(1);
    expect(result[0]?.file).toBe(`specrunner/changes/${SLUG}/test-cases.md`);
  });

  it("canonScope なし → 非正典 finding は現行通り収集される", () => {
    const normalFinding = makeFixableFinding({
      file: "src/util/helper.ts",
      title: "Normal finding",
    });

    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [normalFinding] },
          },
        },
      ],
    });

    const result = collectParallelFixerFindings(state, ["A"]);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// TC-028: 破壊確認 — collectParallelFixerFindings の除外削除で TC-007 が fail
//
// このテストは「除外なしの場合、正典 finding が code-fixer に届く」ことを示し、
// TC-007 が除外ロジックに依存していることを実証する破壊確認記録である。
// ---------------------------------------------------------------------------

describe("TC-028: 破壊確認 — 除外ロジックなし（canonScope 省略）で TC-007 の assertion が fail する", () => {
  it("[破壊確認] canonScope 省略では正典 finding が除外されず code-fixer に届く", () => {
    // This demonstrates what would happen WITHOUT the exclusion logic:
    // the canon finding IS included in the result (code-fixer receives it)
    // → TC-007 assertion (expect not to contain canon finding) would FAIL
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon finding that would reach code-fixer without exclusion",
    });

    const state = makeState({
      "custom-reviewer": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding] },
          },
        },
      ],
    });

    // Without canonScope (simulates exclusion logic removed):
    const result = collectParallelFixerFindings(state, ["custom-reviewer"]);

    // The finding IS present (proving the exclusion is needed for TC-007 to pass)
    const titles = result.map((f) => f.title);
    expect(titles).toContain("Canon finding that would reach code-fixer without exclusion");
  });

  it("[破壊確認] collectFindingsLedger canonScope 省略では正典 finding が除外されない", () => {
    const canonFinding = makeFixableFinding({
      file: `specrunner/changes/${SLUG}/test-cases.md`,
      title: "Canon finding in ledger without exclusion",
    });

    const state = makeState({
      "code-review": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [canonFinding] },
          },
        },
      ],
    });

    // Without canonScope → finding NOT excluded
    const ledger = collectFindingsLedger(["code-review"], state);
    expect(ledger.map((f) => f.title)).toContain("Canon finding in ledger without exclusion");
  });
});
