/**
 * Unit tests for findings-ledger.ts pure functions.
 *
 * T-03:
 * (a) fixable findings from intermediate iterations remain even after final approved
 * (b) decision-needed findings are excluded
 * (c) structural duplicates are collapsed to 1
 * (d) StepRuns with missing findings/toolResult are safely ignored
 * (e) empty chain or empty findings → empty array
 */
import { describe, it, expect } from "vitest";
import { collectFindingsLedger, dedupeFindings } from "../findings-ledger.js";
import type { JobState } from "../../../state/schema.js";
import type { Finding } from "../../../kernel/report-result.js";
import type { StepRun } from "../../../state/schema.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    request: { path: "/req.md", title: "T", type: "bug-fix", slug: "s" },
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

function makeFixableFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "fixable",
    file: "src/foo.ts",
    line: 10,
    title: "Default finding",
    rationale: "Fix this",
    ...overrides,
  };
}

function makeDecisionNeededFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: "high",
    resolution: "decision-needed",
    file: "src/bar.ts",
    title: "Needs decision",
    rationale: "Requires author decision",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (a) Fixable findings from intermediate iterations remain even after approved
// ---------------------------------------------------------------------------

describe("collectFindingsLedger — (a) intermediate fixable findings are retained", () => {
  it("includes fixable finding from an early iteration even when last run is approved (empty findings)", () => {
    const finding = makeFixableFinding({ title: "Issue in iter 1", file: "src/a.ts" });
    const state = makeState({
      "code-review": [
        // iteration 1: needs-fix with fixable finding
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [finding] },
          },
        },
        // iteration 2: approved, no findings
        {
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
    });

    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.title).toBe("Issue in iter 1");
  });
});

// ---------------------------------------------------------------------------
// (b) decision-needed findings are excluded
// ---------------------------------------------------------------------------

describe("collectFindingsLedger — (b) decision-needed findings excluded", () => {
  it("does not include decision-needed findings", () => {
    const fixable = makeFixableFinding({ title: "Fixable issue" });
    const decisionNeeded = makeDecisionNeededFinding({ title: "Decision needed" });
    const state = makeState({
      "code-review": [
        {
          outcome: {
            verdict: "escalation",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [fixable, decisionNeeded] },
          },
        },
      ],
    });

    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.title).toBe("Fixable issue");
    expect(ledger.every((f) => f.resolution === "fixable")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// (c) Structural duplicates collapse to 1
// ---------------------------------------------------------------------------

describe("dedupeFindings — (c) structural duplicates", () => {
  it("collapses duplicates with same file+line+title to first occurrence", () => {
    const f1 = makeFixableFinding({ file: "src/foo.ts", line: 5, title: "Bug", rationale: "First" });
    const f2 = makeFixableFinding({ file: "src/foo.ts", line: 5, title: "Bug", rationale: "Second (dup)" });
    const f3 = makeFixableFinding({ file: "src/foo.ts", line: 6, title: "Bug", rationale: "Different line" });

    const result = dedupeFindings([f1, f2, f3]);
    expect(result).toHaveLength(2);
    expect(result[0]!.rationale).toBe("First");
    expect(result[1]!.rationale).toBe("Different line");
  });

  it("treats absent line as empty string key segment", () => {
    const f1 = makeFixableFinding({ file: "src/x.ts", title: "NoLine", line: undefined });
    const f2 = makeFixableFinding({ file: "src/x.ts", title: "NoLine", line: undefined });
    const f3 = makeFixableFinding({ file: "src/x.ts", title: "NoLine", line: 1 });

    const result = dedupeFindings([f1, f2, f3]);
    expect(result).toHaveLength(2);
  });

  it("collectFindingsLedger deduplicates across multiple reviewer runs", () => {
    const finding = makeFixableFinding({ file: "src/a.ts", line: 1, title: "Same finding" });
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "needs-fix", findingsPath: null, error: null, toolResult: { ok: true, findings: [finding] } } },
        { outcome: { verdict: "needs-fix", findingsPath: null, error: null, toolResult: { ok: true, findings: [finding] } } },
      ],
    });

    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (d) StepRuns with missing findings/toolResult are safely ignored
// ---------------------------------------------------------------------------

describe("collectFindingsLedger — (d) missing toolResult/findings ignored", () => {
  it("ignores StepRun with no toolResult (legacy run)", () => {
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "approved", findingsPath: null, error: null } },
      ],
    });
    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toEqual([]);
  });

  it("ignores StepRun with null toolResult", () => {
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: null } },
      ],
    });
    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toEqual([]);
  });

  it("ignores StepRun with toolResult but no findings array", () => {
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: { ok: true } } },
      ],
    });
    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toEqual([]);
  });

  it("ignores step with no runs in state", () => {
    const state = makeState({});
    const ledger = collectFindingsLedger(state, ["code-review"]);
    expect(ledger).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// (e) Empty chain / empty findings → empty array
// ---------------------------------------------------------------------------

describe("collectFindingsLedger — (e) empty chain or findings", () => {
  it("returns empty array for empty reviewer chain", () => {
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: { ok: true, findings: [] } } },
      ],
    });
    const ledger = collectFindingsLedger(state, []);
    expect(ledger).toEqual([]);
  });

  it("returns empty array when all findings are empty arrays", () => {
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: { ok: true, findings: [] } } },
      ],
      "security": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: { ok: true, findings: [] } } },
      ],
    });
    const ledger = collectFindingsLedger(state, ["code-review", "security"]);
    expect(ledger).toEqual([]);
  });

  it("collects fixable findings from multiple reviewer steps", () => {
    const crFinding = makeFixableFinding({ file: "src/a.ts", title: "CR finding" });
    const secFinding = makeFixableFinding({ file: "src/b.ts", title: "Security finding", severity: "critical" });
    const state = makeState({
      "code-review": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: { ok: true, findings: [crFinding] } } },
      ],
      "security": [
        { outcome: { verdict: "approved", findingsPath: null, error: null, toolResult: { ok: true, findings: [secFinding] } } },
      ],
    });
    const ledger = collectFindingsLedger(state, ["code-review", "security"]);
    expect(ledger).toHaveLength(2);
    expect(ledger.map((f) => f.title)).toContain("CR finding");
    expect(ledger.map((f) => f.title)).toContain("Security finding");
  });
});
