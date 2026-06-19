/**
 * Unit tests for findings-ledger.ts pure functions.
 *
 * T-03:
 * (a) fixable findings from intermediate iterations remain even after final approved
 * (b) decision-needed findings are excluded
 * (c) structural duplicates are collapsed to 1
 * (d) StepRuns with missing findings/toolResult are safely ignored
 * (e) empty chain or empty findings → empty array
 * (f) collectParallelFixerFindings: TC-024 / TC-025
 */
import { describe, it, expect } from "vitest";
import { collectFindingsLedger, dedupeFindings, collectParallelFixerFindings } from "../findings-ledger.js";
import type { JobState } from "../../../state/schema.js";
import type { Finding, Observation } from "../../../kernel/report-result.js";
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

// ---------------------------------------------------------------------------
// (f) collectParallelFixerFindings — TC-024 / TC-025
// ---------------------------------------------------------------------------

describe("collectParallelFixerFindings — TC-024: dedup from multiple needs-fix members", () => {
  it("aggregates and deduplicates fixable findings from all needs-fix members", () => {
    const findingX = makeFixableFinding({ file: "src/a.ts", line: 1, title: "X" });
    const findingY = makeFixableFinding({ file: "src/b.ts", line: 2, title: "Y" });
    const findingZ = makeFixableFinding({ file: "src/c.ts", line: 3, title: "Z" });

    // Both A and B are needs-fix; Y is shared (duplicate)
    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [findingX, findingY] },
          },
        },
      ],
      "B": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [findingY, findingZ] },
          },
        },
      ],
    });

    const result = collectParallelFixerFindings(state, ["A", "B"]);
    expect(result).toHaveLength(3);
    const titles = result.map((f) => f.title);
    expect(titles).toContain("X");
    expect(titles).toContain("Y");
    expect(titles).toContain("Z");
  });

  it("returns empty array when all members have empty findings", () => {
    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [] },
          },
        },
      ],
    });

    const result = collectParallelFixerFindings(state, ["A"]);
    expect(result).toEqual([]);
  });

  it("returns empty array for empty members list", () => {
    const state = makeState({});
    const result = collectParallelFixerFindings(state, []);
    expect(result).toEqual([]);
  });
});

describe("collectParallelFixerFindings — TC-025: approved member findings excluded", () => {
  it("excludes findings from approved members", () => {
    const findingFromA = makeFixableFinding({ file: "src/a.ts", title: "From A (needs-fix)" });
    const findingFromB = makeFixableFinding({ file: "src/b.ts", title: "From B (approved)" });

    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [findingFromA] },
          },
        },
      ],
      "B": [
        {
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [findingFromB] },
          },
        },
      ],
    });

    const result = collectParallelFixerFindings(state, ["A", "B"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("From A (needs-fix)");
  });

  it("excludes findings from skipped members", () => {
    const findingFromA = makeFixableFinding({ file: "src/a.ts", title: "From A" });
    const findingFromB = makeFixableFinding({ file: "src/b.ts", title: "From B (skipped)" });

    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "needs-fix",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [findingFromA] },
          },
        },
      ],
      "B": [
        {
          outcome: {
            verdict: "skipped",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [findingFromB] },
          },
        },
      ],
    });

    const result = collectParallelFixerFindings(state, ["A", "B"]);
    expect(result).toHaveLength(1);
    expect(result[0]?.title).toBe("From A");
  });

  it("returns empty array when all members are approved", () => {
    const state = makeState({
      "A": [
        {
          outcome: {
            verdict: "approved",
            findingsPath: null,
            error: null,
            toolResult: { ok: true, findings: [makeFixableFinding({ title: "A finding" })] },
          },
        },
      ],
    });

    const result = collectParallelFixerFindings(state, ["A"]);
    expect(result).toEqual([]);
  });

  it("ignores members with no runs in state", () => {
    const state = makeState({});
    const result = collectParallelFixerFindings(state, ["A", "B"]);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T-06 invariant: observations are excluded from ledger (AC 3)
// ---------------------------------------------------------------------------

describe("collectFindingsLedger — observations excluded (T-06 invariant)", () => {
  it("observations in toolResult are not included in the ledger", () => {
    const fixableFinding = makeFixableFinding({ title: "Fixable finding" });
    const observation: Observation = {
      severity: "low",
      file: "src/foo.ts",
      title: "Observation title",
      rationale: "Informational only",
    };

    // Simulate a toolResult that contains both findings and observations
    const state: JobState = {
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
      steps: {
        "code-review": [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:00:00Z",
            endedAt: "2026-01-01T00:00:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [fixableFinding],
                observations: [observation],
              },
            },
          },
        ],
      },
    };

    const ledger = collectFindingsLedger(state, ["code-review"]);

    // The fixable finding must appear
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.title).toBe("Fixable finding");

    // The observation must NOT appear (it has no `resolution` field)
    const observationTitles = ledger.map((f) => f.title);
    expect(observationTitles).not.toContain("Observation title");
  });
});
