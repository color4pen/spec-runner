/**
 * T-08: reviewer chain transition tests for "skipped" verdict.
 *
 * Verifies:
 * - (reviewer, skipped) → next reviewer in chain
 * - (reviewer, skipped) → conformance when reviewer is last
 * - skipped rows do NOT point to code-fixer
 * - Existing approved/needs-fix transitions are unaffected
 */
import { describe, it, expect } from "vitest";
import { buildReviewerChainTransitions } from "../../../src/core/pipeline/reviewer-chain.js";
import { STEP_NAMES } from "../../../src/core/step/step-names.js";

function getTransitions(chain: string[]) {
  return buildReviewerChainTransitions(chain);
}

function findTransition(
  transitions: ReturnType<typeof buildReviewerChainTransitions>,
  step: string,
  on: string,
  to?: string,
) {
  return transitions.filter(
    (t) => t.step === step && t.on === on && (to === undefined || t.to === to),
  );
}

// ---------------------------------------------------------------------------
// chain = ["code-review", "A", "B"]
// ---------------------------------------------------------------------------

describe("buildReviewerChainTransitions — skipped rows for multi-reviewer chain", () => {
  const chain = [STEP_NAMES.CODE_REVIEW, "A", "B"];
  const transitions = getTransitions(chain);

  it("(code-review, skipped) → A", () => {
    const rows = findTransition(transitions, STEP_NAMES.CODE_REVIEW, "skipped", "A");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("(A, skipped) → B", () => {
    const rows = findTransition(transitions, "A", "skipped", "B");
    expect(rows.length).toBeGreaterThan(0);
  });

  it("(B, skipped) → conformance", () => {
    const rows = findTransition(transitions, "B", "skipped", STEP_NAMES.CONFORMANCE);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("skipped rows do NOT point to code-fixer", () => {
    const skippedToFixer = transitions.filter(
      (t) => t.on === "skipped" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(skippedToFixer).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// chain = ["code-review"] — single reviewer (standard pipeline)
// ---------------------------------------------------------------------------

describe("buildReviewerChainTransitions — single-reviewer chain (regression)", () => {
  const chain = [STEP_NAMES.CODE_REVIEW];
  const transitions = getTransitions(chain);

  it("(code-review, skipped) → conformance", () => {
    const rows = findTransition(transitions, STEP_NAMES.CODE_REVIEW, "skipped", STEP_NAMES.CONFORMANCE);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("(code-review, approved) → conformance row still exists", () => {
    const rows = findTransition(transitions, STEP_NAMES.CODE_REVIEW, "approved", STEP_NAMES.CONFORMANCE);
    expect(rows.length).toBeGreaterThan(0);
  });

  it("(code-review, needs-fix) → code-fixer row still exists", () => {
    const rows = findTransition(transitions, STEP_NAMES.CODE_REVIEW, "needs-fix", STEP_NAMES.CODE_FIXER);
    expect(rows.length).toBeGreaterThan(0);
  });
});
