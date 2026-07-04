/**
 * T-08: reviewer-chain.ts unit tests.
 *
 * Tests for:
 * - deriveImplReviewerChain (from state and from snapshots)
 * - resolveActiveReviewer (no runs, single reviewer, multiple reviewers)
 * - nextAfterReviewer (mid-chain, last-in-chain → conformance)
 * - buildParallelReviewerTransitions (TC-029, TC-030, TC-031)
 * - routing predicates: conformanceFixInProgress, regressionGateActive, codeReviewLoopActive
 * - buildReviewerChainTransitions (TC-032)
 */
import { describe, it, expect } from "vitest";
import {
  deriveImplReviewerChain,
  deriveImplFixerChain,
  resolveActiveReviewer,
  nextAfterReviewer,
  buildParallelReviewerTransitions,
  buildReviewerChainTransitions,
  conformanceFixInProgress,
  regressionGateActive,
  codeReviewLoopActive,
  codeReviewFindingsRoutingActive,
} from "../reviewer-chain.js";
import { STEP_NAMES } from "../../step/step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../../step/regression-gate.js";
import type { JobState } from "../../../state/schema.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(steps: Record<string, Array<{ startedAt: string; endedAt: string; outcome: { verdict: string } }>> = {}): JobState {
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
    steps: steps as unknown as JobState["steps"],
  };
}

function makeSnapshot(name: string, maxIterations = 3): ReviewerSnapshot {
  return { name, maxIterations, purpose: "p", criteria: "c", judgment: "j", freeText: "" };
}

// ---------------------------------------------------------------------------
// deriveImplReviewerChain
// ---------------------------------------------------------------------------

describe("deriveImplReviewerChain", () => {
  it("returns ['code-review'] when state has no custom reviewers", () => {
    const chain = deriveImplReviewerChain(makeState());
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
  });

  it("returns ['code-review', ...custom] when state has reviewers", () => {
    const state: JobState = { ...makeState(), reviewers: [makeSnapshot("security"), makeSnapshot("perf")] };
    const chain = deriveImplReviewerChain(state);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW, "security", "perf"]);
  });

  it("accepts ReviewerSnapshot[] directly", () => {
    const snapshots: ReviewerSnapshot[] = [makeSnapshot("security")];
    const chain = deriveImplReviewerChain(snapshots);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW, "security"]);
  });

  it("accepts empty array (no custom reviewers)", () => {
    const chain = deriveImplReviewerChain([]);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
  });
});

// ---------------------------------------------------------------------------
// deriveImplFixerChain
// ---------------------------------------------------------------------------

describe("deriveImplFixerChain", () => {
  it("(a) returns ['code-review'] when state has no custom reviewers", () => {
    const chain = deriveImplFixerChain(makeState());
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
  });

  it("(b) returns ['code-review', ...names, 'regression-gate'] when reviewers non-empty", () => {
    const state: JobState = { ...makeState(), reviewers: [makeSnapshot("security"), makeSnapshot("perf")] };
    const chain = deriveImplFixerChain(state);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW, "security", "perf", REGRESSION_GATE_STEP_NAME]);
  });

  it("does not include regression-gate when reviewers is empty array", () => {
    const state: JobState = { ...makeState(), reviewers: [] };
    const chain = deriveImplFixerChain(state);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
    expect(chain).not.toContain(REGRESSION_GATE_STEP_NAME);
  });

  it("does not include regression-gate when reviewers is undefined", () => {
    const state: JobState = { ...makeState(), reviewers: undefined };
    const chain = deriveImplFixerChain(state);
    expect(chain).toEqual([STEP_NAMES.CODE_REVIEW]);
    expect(chain).not.toContain(REGRESSION_GATE_STEP_NAME);
  });
});

// ---------------------------------------------------------------------------
// resolveActiveReviewer
// ---------------------------------------------------------------------------

describe("resolveActiveReviewer", () => {
  it("returns first in chain when no reviewer has run", () => {
    const state = makeState();
    const chain = [STEP_NAMES.CODE_REVIEW];
    expect(resolveActiveReviewer(state, chain)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  it("returns the reviewer with the most recent startedAt", () => {
    const state = makeState({
      "code-review": [
        { startedAt: "2026-01-01T00:01:00Z", endedAt: "2026-01-01T00:01:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    expect(resolveActiveReviewer(state, chain)).toBe("security");
  });

  it("returns code-review when it ran after security", () => {
    const state = makeState({
      "code-review": [
        { startedAt: "2026-01-01T00:03:00Z", endedAt: "2026-01-01T00:03:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    expect(resolveActiveReviewer(state, chain)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  it("handles multiple runs for same reviewer (uses last run startedAt)", () => {
    const state = makeState({
      "code-review": [
        { startedAt: "2026-01-01T00:01:00Z", endedAt: "2026-01-01T00:01:30Z", outcome: { verdict: "needs-fix" } },
        { startedAt: "2026-01-01T00:03:00Z", endedAt: "2026-01-01T00:03:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: "2026-01-01T00:02:00Z", endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    // code-review's last run startedAt 00:03 > security's last run startedAt 00:02
    expect(resolveActiveReviewer(state, chain)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  // TC-028: same startedAt timestamp → chain 後位優先 (>= tie-break)
  it("TC-028: tie-break on equal startedAt favours later reviewer in chain", () => {
    const sameTime = "2026-01-01T00:02:00Z";
    const state = makeState({
      "code-review": [
        { startedAt: sameTime, endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "approved" } },
      ],
      "security": [
        { startedAt: sameTime, endedAt: "2026-01-01T00:02:30Z", outcome: { verdict: "needs-fix" } },
      ],
    });
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    // Equal startedAt: security is later in chain so it should win
    expect(resolveActiveReviewer(state, chain)).toBe("security");
  });
});

// ---------------------------------------------------------------------------
// nextAfterReviewer
// ---------------------------------------------------------------------------

describe("nextAfterReviewer", () => {
  it("returns next reviewer when current is not last", () => {
    const chain = [STEP_NAMES.CODE_REVIEW, "security", "perf"];
    expect(nextAfterReviewer(STEP_NAMES.CODE_REVIEW, chain)).toBe("security");
    expect(nextAfterReviewer("security", chain)).toBe("perf");
  });

  it("returns CONFORMANCE when reviewer is last in chain", () => {
    const chain = [STEP_NAMES.CODE_REVIEW, "security"];
    expect(nextAfterReviewer("security", chain)).toBe(STEP_NAMES.CONFORMANCE);
  });

  it("returns CONFORMANCE for code-review when it is the only reviewer", () => {
    const chain = [STEP_NAMES.CODE_REVIEW];
    expect(nextAfterReviewer(STEP_NAMES.CODE_REVIEW, chain)).toBe(STEP_NAMES.CONFORMANCE);
  });

  it("returns CONFORMANCE when reviewer is not found in chain", () => {
    const chain = [STEP_NAMES.CODE_REVIEW];
    expect(nextAfterReviewer("unknown", chain)).toBe(STEP_NAMES.CONFORMANCE);
  });
});

// ---------------------------------------------------------------------------
// buildParallelReviewerTransitions — TC-029, TC-030, TC-031
// ---------------------------------------------------------------------------

const COORDINATOR = "custom-reviewers";
const MEMBERS = ["A", "B"] as const;

describe("buildParallelReviewerTransitions — TC-029: coordinator transition rows", () => {
  const transitions = buildParallelReviewerTransitions({ coordinator: COORDINATOR, members: MEMBERS });

  it("code-review approved (clean, no fixable findings) → coordinator", () => {
    // The second approved row for code-review (no when guard) should go to coordinator
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "approved" && t.to === COORDINATOR && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("coordinator approved → regression-gate", () => {
    const row = transitions.find(
      (t) => t.step === COORDINATOR && t.on === "approved" && t.to === REGRESSION_GATE_STEP_NAME,
    );
    expect(row).toBeDefined();
  });

  it("coordinator needs-fix → code-fixer", () => {
    const row = transitions.find(
      (t) => t.step === COORDINATOR && t.on === "needs-fix" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(row).toBeDefined();
  });

  it("coordinator skipped → regression-gate", () => {
    const row = transitions.find(
      (t) => t.step === COORDINATOR && t.on === "skipped" && t.to === REGRESSION_GATE_STEP_NAME,
    );
    expect(row).toBeDefined();
  });

  it("code-review needs-fix → code-fixer", () => {
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "needs-fix" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(row).toBeDefined();
  });

  it("code-review skipped → coordinator", () => {
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "skipped" && t.to === COORDINATOR,
    );
    expect(row).toBeDefined();
  });

  it("regression-gate approved (clean) → conformance", () => {
    const row = transitions.find(
      (t) =>
        t.step === REGRESSION_GATE_STEP_NAME &&
        t.on === "approved" &&
        t.to === STEP_NAMES.CONFORMANCE &&
        !t.when,
    );
    expect(row).toBeDefined();
  });

  it("regression-gate needs-fix → code-fixer", () => {
    const row = transitions.find(
      (t) => t.step === REGRESSION_GATE_STEP_NAME && t.on === "needs-fix" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(row).toBeDefined();
  });
});

describe("buildParallelReviewerTransitions — TC-030: no member-name rows generated", () => {
  const transitions = buildParallelReviewerTransitions({ coordinator: COORDINATOR, members: MEMBERS });

  it("no transition has step === 'A'", () => {
    const memberARows = transitions.filter((t) => t.step === "A");
    expect(memberARows).toHaveLength(0);
  });

  it("no transition has step === 'B'", () => {
    const memberBRows = transitions.filter((t) => t.step === "B");
    expect(memberBRows).toHaveLength(0);
  });

  it("no transition routes TO 'A' or 'B'", () => {
    const toMember = transitions.filter((t) => t.to === "A" || t.to === "B");
    expect(toMember).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Routing predicates: conformanceFixInProgress, regressionGateActive, codeReviewLoopActive
// Used by buildParallelReviewerTransitions code-fixer rows (TC-031)
// ---------------------------------------------------------------------------

describe("conformanceFixInProgress", () => {
  it("returns false when no conformance run exists", () => {
    expect(conformanceFixInProgress(makeState())).toBe(false);
  });

  it("returns true when conformance last verdict is needs-fix:code-fixer and has findings", () => {
    // getConformanceFixContext requires toolResult.findings to be present
    const state: JobState = {
      ...makeState(),
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:05:00Z",
            endedAt: "2026-01-01T00:05:30Z",
            outcome: {
              verdict: "needs-fix:code-fixer",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "high", resolution: "fixable", file: "src/foo.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
        // No code-review runs → predecessor code-review has no runs → recency check skipped
      } as unknown as JobState["steps"],
    };
    expect(conformanceFixInProgress(state)).toBe(true);
  });

  it("returns false when conformance verdict is not needs-fix:code-fixer", () => {
    const state = makeState({
      [STEP_NAMES.CONFORMANCE]: [
        {
          startedAt: "2026-01-01T00:05:00Z",
          endedAt: "2026-01-01T00:05:30Z",
          outcome: { verdict: "approved" },
        },
      ],
    });
    expect(conformanceFixInProgress(state)).toBe(false);
  });
});

describe("regressionGateActive", () => {
  it("returns false when no regression-gate run exists", () => {
    expect(regressionGateActive(makeState())).toBe(false);
  });

  it("returns true when regression-gate last verdict is needs-fix", () => {
    const state = makeState({
      [REGRESSION_GATE_STEP_NAME]: [
        {
          startedAt: "2026-01-01T00:04:00Z",
          endedAt: "2026-01-01T00:04:30Z",
          outcome: { verdict: "needs-fix" },
        },
      ],
    });
    expect(regressionGateActive(state)).toBe(true);
  });

  it("returns true when regression-gate approved with fixable findings", () => {
    const state: JobState = {
      ...makeState(),
      steps: {
        [REGRESSION_GATE_STEP_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:04:00Z",
            endedAt: "2026-01-01T00:04:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [
                  { severity: "high", resolution: "fixable", file: "src/foo.ts", title: "T", rationale: "R" },
                ],
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    expect(regressionGateActive(state)).toBe(true);
  });

  it("returns false when regression-gate approved with no fixable findings", () => {
    const state: JobState = {
      ...makeState(),
      steps: {
        [REGRESSION_GATE_STEP_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:04:00Z",
            endedAt: "2026-01-01T00:04:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: { ok: true, findings: [] },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    expect(regressionGateActive(state)).toBe(false);
  });
});

describe("codeReviewLoopActive", () => {
  const coord = "custom-reviewers";

  it("returns false when no code-review runs exist", () => {
    expect(codeReviewLoopActive(makeState(), coord)).toBe(false);
  });

  it("returns false when coordinator has already run (past code-review loop)", () => {
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: { verdict: "needs-fix" },
        },
      ],
      [coord]: [
        {
          startedAt: "2026-01-01T00:02:00Z",
          endedAt: "2026-01-01T00:02:30Z",
          outcome: { verdict: "approved" },
        },
      ],
    });
    expect(codeReviewLoopActive(state, coord)).toBe(false);
  });

  it("returns true when coordinator has not run AND code-review last verdict is needs-fix", () => {
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: { verdict: "needs-fix" },
        },
      ],
    });
    expect(codeReviewLoopActive(state, coord)).toBe(true);
  });

  it("returns false when code-review last verdict is not needs-fix", () => {
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: { verdict: "approved" },
        },
      ],
    });
    expect(codeReviewLoopActive(state, coord)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-031: code-fixer routing priority in buildParallelReviewerTransitions
// conformance > regression-gate > code-review > coordinator
// ---------------------------------------------------------------------------

describe("buildParallelReviewerTransitions — TC-031: code-fixer routing priority", () => {
  const coordinator = "custom-reviewers";
  const transitions = buildParallelReviewerTransitions({ coordinator, members: ["A", "B"] });
  const fixerRows = transitions.filter(
    (t) => t.step === STEP_NAMES.CODE_FIXER && t.on === "approved",
  );

  /**
   * Helper: find the first matching code-fixer row given a state.
   * Simulates the pipeline engine's priority-ordered `when` evaluation.
   */
  function resolveFixerTarget(state: JobState): string | undefined {
    for (const row of fixerRows) {
      if (!row.when || row.when(state)) {
        return row.to;
      }
    }
    return undefined;
  }

  it("(1) conformanceFixInProgress → routes to conformance", () => {
    // conformance ran with needs-fix:code-fixer + findings; no predecessor runs → active
    const state: JobState = {
      ...makeState(),
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:05:00Z",
            endedAt: "2026-01-01T00:05:30Z",
            outcome: {
              verdict: "needs-fix:code-fixer",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "high", resolution: "fixable", file: "src/x.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    expect(resolveFixerTarget(state)).toBe(STEP_NAMES.CONFORMANCE);
  });

  it("(2) regressionGateActive (no conformance) → routes to regression-gate", () => {
    const state = makeState({
      [REGRESSION_GATE_STEP_NAME]: [
        {
          startedAt: "2026-01-01T00:04:00Z",
          endedAt: "2026-01-01T00:04:30Z",
          outcome: { verdict: "needs-fix" },
        },
      ],
    });
    expect(resolveFixerTarget(state)).toBe(REGRESSION_GATE_STEP_NAME);
  });

  it("(3) codeReviewLoopActive (no conformance, no regression-gate) → routes to code-review", () => {
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: { verdict: "needs-fix" },
        },
      ],
      // coordinator has no runs → codeReviewLoopActive = true
    });
    expect(resolveFixerTarget(state)).toBe(STEP_NAMES.CODE_REVIEW);
  });

  it("(4) all predicates false → default routes to coordinator", () => {
    // No conformance, no regression-gate, code-review approved (not needs-fix)
    const state = makeState({
      [STEP_NAMES.CODE_REVIEW]: [
        {
          startedAt: "2026-01-01T00:01:00Z",
          endedAt: "2026-01-01T00:01:30Z",
          outcome: { verdict: "approved" },
        },
      ],
      [coordinator]: [
        {
          startedAt: "2026-01-01T00:02:00Z",
          endedAt: "2026-01-01T00:02:30Z",
          outcome: { verdict: "needs-fix" },
        },
      ],
    });
    expect(resolveFixerTarget(state)).toBe(coordinator);
  });

  it("code-fixer error → routes to escalate", () => {
    const errorRow = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_FIXER && t.on === "error" && t.to === "escalate",
    );
    expect(errorRow).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// codeReviewFindingsRoutingActive
// ---------------------------------------------------------------------------

describe("codeReviewFindingsRoutingActive", () => {
  /** Helper: build a state with a code-review run that has the given verdict + findings. */
  function makeStateWithCodeReview(verdict: string, findings: Array<{ severity: string; resolution: string }> = []): JobState {
    return {
      ...makeState(),
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:01:00Z",
            endedAt: "2026-01-01T00:01:30Z",
            outcome: {
              verdict,
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: findings.map((f) => ({
                  severity: f.severity as import("../../../kernel/report-result.js").FindingSeverity,
                  resolution: f.resolution as import("../../../kernel/report-result.js").FindingResolution,
                  file: "src/foo.ts",
                  title: "T",
                  rationale: "R",
                })),
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
  }

  it("approved + fixable(low) findings + no other reviewer → true", () => {
    const state = makeStateWithCodeReview("approved", [
      { severity: "low", resolution: "fixable" },
    ]);
    expect(codeReviewFindingsRoutingActive(state)).toBe(true);
  });

  it("approved + fixable(medium) findings + no other reviewer → true", () => {
    const state = makeStateWithCodeReview("approved", [
      { severity: "medium", resolution: "fixable" },
    ]);
    expect(codeReviewFindingsRoutingActive(state)).toBe(true);
  });

  it("approved + no fixable findings (empty) → false", () => {
    const state = makeStateWithCodeReview("approved", []);
    expect(codeReviewFindingsRoutingActive(state)).toBe(false);
  });

  it("approved + only decision-needed findings → false", () => {
    const state = makeStateWithCodeReview("approved", [
      { severity: "high", resolution: "decision-needed" },
    ]);
    expect(codeReviewFindingsRoutingActive(state)).toBe(false);
  });

  it("needs-fix (no fixable findings path) → false", () => {
    const state = makeStateWithCodeReview("needs-fix", [
      { severity: "high", resolution: "fixable" },
    ]);
    expect(codeReviewFindingsRoutingActive(state)).toBe(false);
  });

  it("no code-review runs → false", () => {
    expect(codeReviewFindingsRoutingActive(makeState())).toBe(false);
  });

  it("conformance latest needs-fix:code-fixer (more recent than code-review) → false (conformance is the trigger)", () => {
    const state: JobState = {
      ...makeState(),
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:01:00Z",
            endedAt: "2026-01-01T00:01:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "low", resolution: "fixable", file: "src/foo.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
        [STEP_NAMES.CONFORMANCE]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:05:00Z",
            endedAt: "2026-01-01T00:05:30Z",
            outcome: {
              verdict: "needs-fix:code-fixer",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "high", resolution: "fixable", file: "src/bar.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    expect(codeReviewFindingsRoutingActive(state)).toBe(false);
  });

  it("regression-gate ran after code-review (regression-gate is now active) → false", () => {
    // regression-gate only appears in the fixer chain when state.reviewers is non-empty.
    // Include a custom reviewer snapshot so deriveImplFixerChain adds regression-gate.
    const state: JobState = {
      ...makeState(),
      reviewers: [makeSnapshot("security")],
      steps: {
        [STEP_NAMES.CODE_REVIEW]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:01:00Z",
            endedAt: "2026-01-01T00:01:30Z",
            outcome: {
              verdict: "approved",
              findingsPath: null,
              error: null,
              toolResult: {
                ok: true,
                findings: [{ severity: "low", resolution: "fixable", file: "src/foo.ts", title: "T", rationale: "R" }],
              },
            },
          },
        ],
        [REGRESSION_GATE_STEP_NAME]: [
          {
            attempt: 1,
            sessionId: null,
            startedAt: "2026-01-01T00:04:00Z",
            endedAt: "2026-01-01T00:04:30Z",
            outcome: {
              verdict: "needs-fix",
              findingsPath: null,
              error: null,
              toolResult: null,
            },
          },
        ],
      } as unknown as JobState["steps"],
    };
    // regression-gate has a later startedAt → it is the active reviewer, not code-review
    expect(codeReviewFindingsRoutingActive(state)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-032: buildReviewerChainTransitions(["code-review"]) is unchanged
// ---------------------------------------------------------------------------

describe("buildReviewerChainTransitions — TC-032: single code-review is unchanged", () => {
  it("generates approved (fixable) → code-fixer row for code-review", () => {
    const transitions = buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]);
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "approved" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(row).toBeDefined();
    expect(row!.when).toBeDefined(); // conditional (fixable findings check)
  });

  it("generates approved (clean) → conformance row for code-review", () => {
    const transitions = buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]);
    const row = transitions.find(
      (t) =>
        t.step === STEP_NAMES.CODE_REVIEW &&
        t.on === "approved" &&
        t.to === STEP_NAMES.CONFORMANCE &&
        !t.when,
    );
    expect(row).toBeDefined();
  });

  it("generates needs-fix → code-fixer row for code-review", () => {
    const transitions = buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]);
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "needs-fix" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(row).toBeDefined();
  });

  it("generates code-fixer approved → conformance row (active reviewer approved)", () => {
    const transitions = buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]);
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_FIXER && t.on === "approved" && t.to === STEP_NAMES.CONFORMANCE && t.when,
    );
    expect(row).toBeDefined();
  });

  it("generates code-fixer error → escalate row", () => {
    const transitions = buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]);
    const row = transitions.find(
      (t) => t.step === STEP_NAMES.CODE_FIXER && t.on === "error" && t.to === "escalate",
    );
    expect(row).toBeDefined();
  });

  it("does not generate member-level rows for custom reviewers", () => {
    const transitions = buildReviewerChainTransitions([STEP_NAMES.CODE_REVIEW]);
    // Only code-review and code-fixer rows should exist
    const stepNames = [...new Set(transitions.map((t) => t.step))];
    expect(stepNames).toEqual(
      expect.arrayContaining([STEP_NAMES.CODE_REVIEW, STEP_NAMES.CODE_FIXER]),
    );
    // No REGRESSION_GATE or coordinator rows
    expect(stepNames).not.toContain(REGRESSION_GATE_STEP_NAME);
  });
});
