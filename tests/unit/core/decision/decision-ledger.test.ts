/**
 * Unit tests for src/core/decision/decision-ledger.ts
 *
 * Covers:
 * - computeFindingKey: deterministic key generation, normalization
 * - isFindingDecided: matching against ledger
 * - filterUndecidedFindings: filtering decided findings from a set
 * - getOpenDecisionFindings: extracting open decisions from job state
 */
import { describe, it, expect } from "vitest";
import {
  computeFindingKey,
  isFindingDecided,
  filterUndecidedFindings,
  getOpenDecisionFindings,
} from "../../../../src/core/decision/decision-ledger.js";
import type { Finding } from "../../../../src/kernel/report-result.js";
import type { OptionDecisionRecord, DispositionDecisionRecord, JobState } from "../../../../src/state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "medium",
    resolution: "decision-needed",
    file: "src/foo.ts",
    title: "Test finding",
    rationale: "Test rationale",
    options: [
      { label: "Option A", consequence: "Consequence A" },
      { label: "Option B", consequence: "Consequence B" },
    ],
    ...overrides,
  };
}

function makeDecisionRecord(overrides: Partial<OptionDecisionRecord> = {}): OptionDecisionRecord {
  return {
    id: "decision-2026-01-01T00:00:00.000Z-1",
    step: "spec-review",
    findingKey: computeFindingKey("spec-review", makeFinding()),
    finding: {
      title: "Test finding",
      file: "src/foo.ts",
      rationale: "Test rationale",
      severity: "medium",
    },
    selectedOption: { number: 1, label: "Option A", consequence: "Consequence A" },
    decidedAt: "2026-01-01T00:00:00.000Z",
    source: "issue-comment",
    ...overrides,
  };
}

function makeJobState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "test-job-id",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "feature" },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "spec-review",
    status: "awaiting-resume",
    branch: "feat/test",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeFindingKey
// ---------------------------------------------------------------------------

describe("computeFindingKey", () => {
  it("produces a deterministic key from step and finding fields", () => {
    const finding = makeFinding();
    const key1 = computeFindingKey("spec-review", finding);
    const key2 = computeFindingKey("spec-review", finding);
    expect(key1).toBe(key2);
  });

  it("includes the step name in the key", () => {
    const finding = makeFinding();
    const keyA = computeFindingKey("spec-review", finding);
    const keyB = computeFindingKey("code-review", finding);
    expect(keyA).not.toBe(keyB);
    expect(keyA).toContain("spec-review");
  });

  it("normalizes title: trims, collapses whitespace, lowercases", () => {
    const findingA = makeFinding({ title: "  Missing null check  " });
    const findingB = makeFinding({ title: "missing   null   check" });
    expect(computeFindingKey("step", findingA)).toBe(computeFindingKey("step", findingB));
  });

  it("normalizes rationale: trims, collapses whitespace, lowercases", () => {
    const findingA = makeFinding({ rationale: "  Null dereference  " });
    const findingB = makeFinding({ rationale: "null  dereference" });
    expect(computeFindingKey("step", findingA)).toBe(computeFindingKey("step", findingB));
  });

  it("includes file and line in the key (line present)", () => {
    const findingA = makeFinding({ file: "src/foo.ts", line: 10 });
    const findingB = makeFinding({ file: "src/bar.ts", line: 10 });
    const findingC = makeFinding({ file: "src/foo.ts", line: 20 });
    expect(computeFindingKey("step", findingA)).not.toBe(computeFindingKey("step", findingB));
    expect(computeFindingKey("step", findingA)).not.toBe(computeFindingKey("step", findingC));
  });

  it("line absent produces different key than line present", () => {
    const withLine = makeFinding({ file: "src/foo.ts", line: 1 });
    const withoutLine = makeFinding({ file: "src/foo.ts", line: undefined });
    expect(computeFindingKey("step", withLine)).not.toBe(computeFindingKey("step", withoutLine));
  });

  it("different rationale produces different key", () => {
    const findingA = makeFinding({ rationale: "Null dereference possible" });
    const findingB = makeFinding({ rationale: "Wrong type returned" });
    expect(computeFindingKey("step", findingA)).not.toBe(computeFindingKey("step", findingB));
  });
});

// ---------------------------------------------------------------------------
// isFindingDecided
// ---------------------------------------------------------------------------

describe("isFindingDecided", () => {
  it("returns false when decisions is undefined", () => {
    const finding = makeFinding();
    expect(isFindingDecided("spec-review", finding, undefined)).toBe(false);
  });

  it("returns false when decisions is empty", () => {
    const finding = makeFinding();
    expect(isFindingDecided("spec-review", finding, [])).toBe(false);
  });

  it("returns true when a matching decision exists", () => {
    const finding = makeFinding();
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", finding),
    });
    expect(isFindingDecided("spec-review", finding, [record])).toBe(true);
  });

  it("returns false when decision is for a different step", () => {
    const finding = makeFinding();
    const record = makeDecisionRecord({
      step: "code-review",
      findingKey: computeFindingKey("spec-review", finding),
    });
    expect(isFindingDecided("spec-review", finding, [record])).toBe(false);
  });

  it("returns false when finding key differs (different rationale)", () => {
    const finding = makeFinding({ rationale: "Different rationale" });
    const decidedFinding = makeFinding({ rationale: "Original rationale" });
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", decidedFinding),
    });
    expect(isFindingDecided("spec-review", finding, [record])).toBe(false);
  });

  it("returns false when finding key differs (different file)", () => {
    const finding = makeFinding({ file: "src/other.ts" });
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", makeFinding()), // src/foo.ts
    });
    expect(isFindingDecided("spec-review", finding, [record])).toBe(false);
  });

  it("matches despite whitespace/case normalization", () => {
    const finding = makeFinding({ title: "TEST FINDING", rationale: "  TEST  RATIONALE  " });
    // Normalized version of the same title/rationale
    const normalizedFinding = makeFinding({ title: "test finding", rationale: "test rationale" });
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", normalizedFinding),
    });
    expect(isFindingDecided("spec-review", finding, [record])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// filterUndecidedFindings
// ---------------------------------------------------------------------------

describe("filterUndecidedFindings", () => {
  it("returns all findings when decisions is undefined", () => {
    const findings = [makeFinding(), makeFinding({ title: "Another" })];
    expect(filterUndecidedFindings("step", findings, undefined)).toHaveLength(2);
  });

  it("returns all findings when decisions is empty", () => {
    const findings = [makeFinding()];
    expect(filterUndecidedFindings("step", findings, [])).toHaveLength(1);
  });

  it("removes findings that match a decision record", () => {
    const findingA = makeFinding({ title: "Finding A" });
    const findingB = makeFinding({ title: "Finding B" });
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", findingA),
    });
    const result = filterUndecidedFindings("spec-review", [findingA, findingB], [record]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Finding B");
  });

  it("keeps findings that do not match any decision", () => {
    const finding = makeFinding({ title: "Undecided" });
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", makeFinding({ title: "Different finding" })),
    });
    const result = filterUndecidedFindings("spec-review", [finding], [record]);
    expect(result).toHaveLength(1);
  });

  it("filters by step — keeps findings for different step even if key matches", () => {
    const finding = makeFinding();
    const record = makeDecisionRecord({
      step: "code-review", // different step
      findingKey: computeFindingKey("spec-review", finding),
    });
    const result = filterUndecidedFindings("spec-review", [finding], [record]);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when all findings are decided", () => {
    const findingA = makeFinding({ title: "Finding A" });
    const findingB = makeFinding({ title: "Finding B" });
    const records = [
      makeDecisionRecord({ findingKey: computeFindingKey("spec-review", findingA) }),
      makeDecisionRecord({ id: "decision-2", findingKey: computeFindingKey("spec-review", findingB) }),
    ];
    const result = filterUndecidedFindings("spec-review", [findingA, findingB], records);
    // records have step: "spec-review" (default in makeDecisionRecord)
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// getOpenDecisionFindings
// ---------------------------------------------------------------------------

describe("getOpenDecisionFindings", () => {
  it("returns empty array when resumePoint is absent", () => {
    const state = makeJobState({ resumePoint: undefined });
    expect(getOpenDecisionFindings(state)).toHaveLength(0);
  });

  it("returns empty array when steps is empty", () => {
    const state = makeJobState({
      resumePoint: { step: "spec-review", reason: "test", iterationsExhausted: 0 },
      steps: {},
    });
    expect(getOpenDecisionFindings(state)).toHaveLength(0);
  });

  it("returns empty array when latest step run has no decision-needed findings", () => {
    const state = makeJobState({
      resumePoint: { step: "spec-review", reason: "test", iterationsExhausted: 0 },
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [{ severity: "medium", resolution: "fixable", file: "f.ts", title: "t", rationale: "r" }] },
            },
          },
        ],
      },
    });
    expect(getOpenDecisionFindings(state)).toHaveLength(0);
  });

  it("returns decision-needed findings from latest step run", () => {
    const finding = makeFinding();
    const state = makeJobState({
      resumePoint: { step: "spec-review", reason: "test", iterationsExhausted: 0 },
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: {
              verdict: "escalation",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [finding] },
            },
          },
        ],
      },
    });
    const result = getOpenDecisionFindings(state);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("Test finding");
  });

  it("filters out already-decided findings", () => {
    const finding = makeFinding();
    const record = makeDecisionRecord({
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", finding),
    });
    const state = makeJobState({
      resumePoint: { step: "spec-review", reason: "test", iterationsExhausted: 0 },
      decisions: [record],
      steps: {
        "spec-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: {
              verdict: "escalation",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [finding] },
            },
          },
        ],
      },
    });
    expect(getOpenDecisionFindings(state)).toHaveLength(0);
  });

  // TC-001: kind 無しの既存 decisions が option として読める
  it("TC-001: kind-less legacy record is treated as option (filter/isFindingDecided work unchanged)", () => {
    const finding = makeFinding();
    // A legacy record without `kind` — exactly what's persisted before this change
    const legacyRecord = {
      id: "decision-legacy-1",
      step: "spec-review",
      findingKey: computeFindingKey("spec-review", finding),
      finding: { title: finding.title, file: finding.file, rationale: finding.rationale, severity: finding.severity as "medium" },
      selectedOption: { number: 1, label: "Accept", consequence: "Ok" },
      decidedAt: "2026-01-01T00:00:00Z",
      source: "issue-comment" as const,
    } satisfies OptionDecisionRecord;

    // filterUndecidedFindings must suppress the finding (backward compat)
    const result = filterUndecidedFindings("spec-review", [finding], [legacyRecord]);
    expect(result).toHaveLength(0);
  });

  it("returns empty when no runs exist for the resume step", () => {
    const state = makeJobState({
      resumePoint: { step: "spec-review", reason: "test", iterationsExhausted: 0 },
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00.000Z",
            endedAt: "2026-01-01T00:00:01.000Z",
            outcome: { verdict: "approved", findingsPath: null, error: null },
          },
        ],
      },
    });
    expect(getOpenDecisionFindings(state)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// TC-012: reviewer が wontfix 済み finding を再報告しても verdict が needs-fix にならない
// (filterUndecidedFindings は disposition record にも効く)
// ---------------------------------------------------------------------------

describe("TC-012: disposition record も filterUndecidedFindings で除外される", () => {
  it("filterUndecidedFindings suppresses a re-reported finding that has a disposition record", () => {
    // A finding with resolution "fixable" (not decision-needed)
    const finding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/vuln.ts",
      line: 42,
      title: "SQL injection",
      rationale: "Unescaped input",
    };

    const dispositionRecord: DispositionDecisionRecord = {
      kind: "disposition",
      id: "disp-test-1",
      step: "code-review",
      findingKey: computeFindingKey("code-review", finding),
      finding: {
        title: finding.title,
        file: finding.file,
        line: finding.line,
        rationale: finding.rationale,
        severity: finding.severity,
      },
      disposition: "wontfix",
      reason: "accepted risk",
      decidedAt: "2026-01-01T00:00:00Z",
      source: "operator",
    };

    // Reviewer re-reports the same finding
    const result = filterUndecidedFindings("code-review", [finding], [dispositionRecord]);

    // Must be filtered out — verdict derivation would see 0 findings → no needs-fix
    expect(result).toHaveLength(0);
  });

  it("only suppresses matching step+findingKey — different step not suppressed", () => {
    const finding: Finding = {
      severity: "high",
      resolution: "fixable",
      file: "src/vuln.ts",
      line: 42,
      title: "SQL injection",
      rationale: "Unescaped input",
    };

    const dispositionRecord: DispositionDecisionRecord = {
      kind: "disposition",
      id: "disp-test-2",
      step: "code-review",
      findingKey: computeFindingKey("code-review", finding),
      finding: {
        title: finding.title,
        file: finding.file,
        line: finding.line,
        rationale: finding.rationale,
        severity: finding.severity,
      },
      disposition: "wontfix",
      reason: "accepted risk",
      decidedAt: "2026-01-01T00:00:00Z",
      source: "operator",
    };

    // Different step ("security") — should NOT be suppressed
    const result = filterUndecidedFindings("security", [finding], [dispositionRecord]);
    expect(result).toHaveLength(1);
  });
});
