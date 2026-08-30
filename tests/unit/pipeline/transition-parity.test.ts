/**
 * TC-008 ~ TC-011, TC-023: Transition parity test.
 *
 * Verifies that the step / on / to / guard-presence structure of the pipeline
 * transitions for STANDARD / FAST / custom reviewer pipelines are stable.
 *
 * Uses explicit row-by-row assertions (step, on, to, hasGuard) rather than
 * golden file snapshots (closures are not serializable).
 *
 * TC-008: STANDARD_TRANSITIONS code-review section invariant
 * TC-009: FAST_TRANSITIONS code-review / code-fixer section invariant
 * TC-010: custom reviewer code-fixer priority routing invariant
 * TC-011: coordinator and regression-gate sections invariant
 * TC-023: row count regression guard
 */
import { describe, it, expect } from "vitest";
import {
  buildReviewerChainTransitions,
  buildParallelReviewerTransitions,
} from "../../../src/core/pipeline/reviewer-chain.js";
import { STANDARD_TRANSITIONS, FAST_TRANSITIONS } from "../../../src/core/pipeline/types.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../../../src/core/step/regression-gate.js";

// ---------------------------------------------------------------------------
// Helper types / functions
// ---------------------------------------------------------------------------

interface TransitionShape {
  step: string;
  on: string;
  to: string;
  hasGuard: boolean;
}

function toShapes(transitions: { step: string; on: string; to: string; when?: unknown }[]): TransitionShape[] {
  return transitions.map((t) => ({
    step: t.step,
    on: t.on,
    to: t.to,
    hasGuard: typeof t.when === "function",
  }));
}

// ---------------------------------------------------------------------------
// Expected shapes for buildReviewerChainTransitions(["code-review"])
//
// For chain = ["code-review"], the generated rows are:
// Phase 1 (reviewer → fixer/next):
//   code-review / approved   / code-fixer  / guard=true  (fixable findings)
//   code-review / approved   / conformance / guard=false (clean pass)
//   code-review / needs-fix  / code-fixer  / guard=false
//   code-review / skipped    / conformance / guard=false
// Phase 2 (code-fixer → next, per reviewer, verdict=approved priority):
//   code-fixer  / approved   / conformance / guard=true  (active=code-review && approved)
// Phase 3 (code-fixer → active reviewer fallback):
//   code-fixer  / approved   / code-review / guard=true  (fallback)
// Phase 4 (error):
//   code-fixer  / error      / escalate    / guard=false
// ---------------------------------------------------------------------------

const EXPECTED_CHAIN_SHAPES: TransitionShape[] = [
  { step: STEP_NAMES.CODE_REVIEW,  on: "approved",  to: STEP_NAMES.CODE_FIXER,  hasGuard: true  },
  { step: STEP_NAMES.CODE_REVIEW,  on: "approved",  to: STEP_NAMES.CONFORMANCE, hasGuard: false },
  { step: STEP_NAMES.CODE_REVIEW,  on: "needs-fix", to: STEP_NAMES.CODE_FIXER,  hasGuard: false },
  { step: STEP_NAMES.CODE_REVIEW,  on: "skipped",   to: STEP_NAMES.CONFORMANCE, hasGuard: false },
  { step: STEP_NAMES.CODE_FIXER,   on: "approved",  to: STEP_NAMES.CONFORMANCE, hasGuard: true  },
  { step: STEP_NAMES.CODE_FIXER,   on: "approved",  to: STEP_NAMES.CODE_REVIEW, hasGuard: true  },
  { step: STEP_NAMES.CODE_FIXER,   on: "error",     to: "escalate",             hasGuard: false },
];

// ---------------------------------------------------------------------------
// buildReviewerChainTransitions(["code-review"]) — shape and row count
// ---------------------------------------------------------------------------

describe("buildReviewerChainTransitions — TC-008 / TC-023: shape and row order", () => {
  const chain = [STEP_NAMES.CODE_REVIEW];
  const transitions = buildReviewerChainTransitions(chain);
  const shapes = toShapes(transitions);

  it("produces the expected number of rows", () => {
    expect(shapes).toHaveLength(EXPECTED_CHAIN_SHAPES.length);
  });

  it("matches the expected row shapes in declaration order", () => {
    expect(shapes).toEqual(EXPECTED_CHAIN_SHAPES);
  });

  it("code-review approved → code-fixer has a guard (fixable findings check)", () => {
    expect(shapes[0]).toEqual({ step: STEP_NAMES.CODE_REVIEW, on: "approved", to: STEP_NAMES.CODE_FIXER, hasGuard: true });
  });

  it("code-review approved → conformance has no guard (clean pass)", () => {
    expect(shapes[1]).toEqual({ step: STEP_NAMES.CODE_REVIEW, on: "approved", to: STEP_NAMES.CONFORMANCE, hasGuard: false });
  });

  it("code-review needs-fix → code-fixer has no guard", () => {
    expect(shapes[2]).toEqual({ step: STEP_NAMES.CODE_REVIEW, on: "needs-fix", to: STEP_NAMES.CODE_FIXER, hasGuard: false });
  });

  it("code-review skipped → conformance has no guard", () => {
    expect(shapes[3]).toEqual({ step: STEP_NAMES.CODE_REVIEW, on: "skipped", to: STEP_NAMES.CONFORMANCE, hasGuard: false });
  });

  it("code-fixer approved → conformance has a guard (priority: active reviewer approved)", () => {
    expect(shapes[4]).toEqual({ step: STEP_NAMES.CODE_FIXER, on: "approved", to: STEP_NAMES.CONFORMANCE, hasGuard: true });
  });

  it("code-fixer approved → code-review has a guard (fallback to active reviewer)", () => {
    expect(shapes[5]).toEqual({ step: STEP_NAMES.CODE_FIXER, on: "approved", to: STEP_NAMES.CODE_REVIEW, hasGuard: true });
  });

  it("code-fixer error → escalate has no guard", () => {
    expect(shapes[6]).toEqual({ step: STEP_NAMES.CODE_FIXER, on: "error", to: "escalate", hasGuard: false });
  });
});

// ---------------------------------------------------------------------------
// STANDARD_TRANSITIONS parity — TC-008
//
// STANDARD_TRANSITIONS spreads buildReviewerChainTransitions(["code-review"])
// so the code-review / code-fixer sections must match exactly.
// ---------------------------------------------------------------------------

describe("STANDARD_TRANSITIONS — TC-008: code-review / code-fixer parity", () => {
  const standardCodeReviewFixerRows = STANDARD_TRANSITIONS.filter(
    (t) => t.step === STEP_NAMES.CODE_REVIEW || t.step === STEP_NAMES.CODE_FIXER,
  );
  const standardShapes = toShapes(standardCodeReviewFixerRows);

  it("code-review / code-fixer rows match buildReviewerChainTransitions shape", () => {
    expect(standardShapes).toEqual(EXPECTED_CHAIN_SHAPES);
  });

  it("row count matches expected", () => {
    expect(standardShapes).toHaveLength(EXPECTED_CHAIN_SHAPES.length);
  });
});

// ---------------------------------------------------------------------------
// FAST_TRANSITIONS parity — TC-009
// ---------------------------------------------------------------------------

describe("FAST_TRANSITIONS — TC-009: code-review / code-fixer parity", () => {
  const fastCodeReviewFixerRows = FAST_TRANSITIONS.filter(
    (t) => t.step === STEP_NAMES.CODE_REVIEW || t.step === STEP_NAMES.CODE_FIXER,
  );
  const fastShapes = toShapes(fastCodeReviewFixerRows);

  it("code-review / code-fixer rows match buildReviewerChainTransitions shape", () => {
    expect(fastShapes).toEqual(EXPECTED_CHAIN_SHAPES);
  });

  it("row count matches expected", () => {
    expect(fastShapes).toHaveLength(EXPECTED_CHAIN_SHAPES.length);
  });
});

// ---------------------------------------------------------------------------
// buildParallelReviewerTransitions — TC-010, TC-011
//
// Expected rows for coordinator="custom-reviewers", members=["sec"]:
//
// code-review section (4 rows):
//   code-review / approved   / code-fixer        / guard=true  (fixable)
//   code-review / approved   / custom-reviewers  / guard=false (clean)
//   code-review / needs-fix  / code-fixer        / guard=false
//   code-review / skipped    / custom-reviewers  / guard=false
//
// coordinator section (3 rows):
//   custom-reviewers / approved  / regression-gate / guard=false
//   custom-reviewers / needs-fix / code-fixer      / guard=false
//   custom-reviewers / skipped   / regression-gate / guard=false
//
// regression-gate section (3 rows):
//   regression-gate / approved  / conformance / guard=false
//   regression-gate / needs-fix / code-fixer  / guard=false
//   regression-gate / skipped   / conformance / guard=false
//
// code-fixer section (5 rows):
//   code-fixer / approved / conformance      / guard=true  (priority 1: conformanceFixInProgress)
//   code-fixer / approved / regression-gate  / guard=true  (priority 2: regressionGateActive)
//   code-fixer / approved / code-review      / guard=true  (priority 3: codeReviewLoopActive)
//   code-fixer / approved / custom-reviewers / guard=false (priority 4: default)
//   code-fixer / error    / escalate         / guard=false
// ---------------------------------------------------------------------------

const COORDINATOR = "custom-reviewers";
const MEMBERS = ["sec"] as const;

const EXPECTED_PARALLEL_SHAPES: TransitionShape[] = [
  // code-review section
  { step: STEP_NAMES.CODE_REVIEW,  on: "approved",  to: STEP_NAMES.CODE_FIXER, hasGuard: true  },
  { step: STEP_NAMES.CODE_REVIEW,  on: "approved",  to: COORDINATOR,           hasGuard: false },
  { step: STEP_NAMES.CODE_REVIEW,  on: "needs-fix", to: STEP_NAMES.CODE_FIXER, hasGuard: false },
  { step: STEP_NAMES.CODE_REVIEW,  on: "skipped",   to: COORDINATOR,           hasGuard: false },
  // coordinator section
  { step: COORDINATOR,             on: "approved",  to: REGRESSION_GATE_STEP_NAME, hasGuard: false },
  { step: COORDINATOR,             on: "needs-fix", to: STEP_NAMES.CODE_FIXER,     hasGuard: false },
  { step: COORDINATOR,             on: "skipped",   to: REGRESSION_GATE_STEP_NAME, hasGuard: false },
  // regression-gate section
  { step: REGRESSION_GATE_STEP_NAME, on: "approved",  to: STEP_NAMES.CONFORMANCE, hasGuard: false },
  { step: REGRESSION_GATE_STEP_NAME, on: "needs-fix", to: STEP_NAMES.CODE_FIXER,  hasGuard: false },
  { step: REGRESSION_GATE_STEP_NAME, on: "skipped",   to: STEP_NAMES.CONFORMANCE, hasGuard: false },
  // code-fixer section
  { step: STEP_NAMES.CODE_FIXER,   on: "approved",  to: STEP_NAMES.CONFORMANCE,    hasGuard: true  },
  { step: STEP_NAMES.CODE_FIXER,   on: "approved",  to: REGRESSION_GATE_STEP_NAME, hasGuard: true  },
  { step: STEP_NAMES.CODE_FIXER,   on: "approved",  to: STEP_NAMES.CODE_REVIEW,    hasGuard: true  },
  { step: STEP_NAMES.CODE_FIXER,   on: "approved",  to: COORDINATOR,               hasGuard: false },
  { step: STEP_NAMES.CODE_FIXER,   on: "error",     to: "escalate",                hasGuard: false },
];

describe("buildParallelReviewerTransitions — TC-010 / TC-011: full shape", () => {
  const transitions = buildParallelReviewerTransitions({ coordinator: COORDINATOR, members: MEMBERS });
  const shapes = toShapes(transitions);

  it("produces the expected number of rows (TC-023 regression guard)", () => {
    expect(shapes).toHaveLength(EXPECTED_PARALLEL_SHAPES.length);
  });

  it("matches the expected row shapes in declaration order", () => {
    expect(shapes).toEqual(EXPECTED_PARALLEL_SHAPES);
  });

  // TC-010: code-fixer priority routing
  it("code-fixer: priority 1 (conformanceFixInProgress) → conformance with guard", () => {
    expect(shapes[10]).toEqual({
      step: STEP_NAMES.CODE_FIXER,
      on: "approved",
      to: STEP_NAMES.CONFORMANCE,
      hasGuard: true,
    });
  });

  it("code-fixer: priority 2 (regressionGateActive) → regression-gate with guard", () => {
    expect(shapes[11]).toEqual({
      step: STEP_NAMES.CODE_FIXER,
      on: "approved",
      to: REGRESSION_GATE_STEP_NAME,
      hasGuard: true,
    });
  });

  it("code-fixer: priority 3 (codeReviewLoopActive) → code-review with guard", () => {
    expect(shapes[12]).toEqual({
      step: STEP_NAMES.CODE_FIXER,
      on: "approved",
      to: STEP_NAMES.CODE_REVIEW,
      hasGuard: true,
    });
  });

  it("code-fixer: priority 4 (default) → coordinator with no guard", () => {
    expect(shapes[13]).toEqual({
      step: STEP_NAMES.CODE_FIXER,
      on: "approved",
      to: COORDINATOR,
      hasGuard: false,
    });
  });

  // TC-011: coordinator and regression-gate sections
  it("coordinator: approved → regression-gate, no guard", () => {
    expect(shapes[4]).toEqual({
      step: COORDINATOR,
      on: "approved",
      to: REGRESSION_GATE_STEP_NAME,
      hasGuard: false,
    });
  });

  it("coordinator: needs-fix → code-fixer, no guard", () => {
    expect(shapes[5]).toEqual({
      step: COORDINATOR,
      on: "needs-fix",
      to: STEP_NAMES.CODE_FIXER,
      hasGuard: false,
    });
  });

  it("coordinator: skipped → regression-gate, no guard", () => {
    expect(shapes[6]).toEqual({
      step: COORDINATOR,
      on: "skipped",
      to: REGRESSION_GATE_STEP_NAME,
      hasGuard: false,
    });
  });

  it("regression-gate: approved → conformance, no guard", () => {
    expect(shapes[7]).toEqual({
      step: REGRESSION_GATE_STEP_NAME,
      on: "approved",
      to: STEP_NAMES.CONFORMANCE,
      hasGuard: false,
    });
  });

  it("regression-gate: needs-fix → code-fixer, no guard", () => {
    expect(shapes[8]).toEqual({
      step: REGRESSION_GATE_STEP_NAME,
      on: "needs-fix",
      to: STEP_NAMES.CODE_FIXER,
      hasGuard: false,
    });
  });
});
