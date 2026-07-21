/**
 * Unit tests for reverification predicates.
 *
 * TC-008: codeChangedSinceLastVerification — code-fixer after verification → true
 * TC-009: codeChangedSinceLastVerification — verification after all mutators → false
 * TC-010: codeChangedSinceLastVerification — no verification, mutator present → true
 * TC-011: codeChangedSinceLastVerification — non-code-mutator steps do not affect result
 * TC-012: conformanceApprovedLatest — latest verdict approved → true
 * TC-013: conformanceApprovedLatest — latest verdict needs-fix:code-fixer → false
 * TC-014: conformanceApprovedLatest — no conformance runs → false
 */
import { describe, it, expect } from "vitest";
import {
  codeChangedSinceLastVerification,
  revisionChangedSinceLastVerification,
  reverificationNeeded,
  conformanceApprovedLatest,
  IMPL_CODE_MUTATOR_STEPS,
} from "../../../../src/core/pipeline/reverification.js";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-reverification-job",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    request: { path: "/req.md", title: "Test", type: "bug-fix" },
    repository: { owner: "testowner", name: "testrepo" },
    session: null,
    step: "verification",
    status: "running",
    branch: "fix/test-branch",
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

function makeRun(endedAt: string, verdict = "passed", commitOid?: string): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: endedAt,
    endedAt,
    ...(commitOid !== undefined ? { commitOid } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// IMPL_CODE_MUTATOR_STEPS constant
// ─────────────────────────────────────────────────────────────────────────────
describe("IMPL_CODE_MUTATOR_STEPS", () => {
  it("contains exactly implementer, build-fixer, code-fixer", () => {
    expect(IMPL_CODE_MUTATOR_STEPS).toContain(STEP_NAMES.IMPLEMENTER);
    expect(IMPL_CODE_MUTATOR_STEPS).toContain(STEP_NAMES.BUILD_FIXER);
    expect(IMPL_CODE_MUTATOR_STEPS).toContain(STEP_NAMES.CODE_FIXER);
    expect(IMPL_CODE_MUTATOR_STEPS).toHaveLength(3);
  });

  it("does not contain spec-phase fixers", () => {
    expect(IMPL_CODE_MUTATOR_STEPS).not.toContain(STEP_NAMES.SPEC_FIXER);
    expect(IMPL_CODE_MUTATOR_STEPS).not.toContain(STEP_NAMES.SPEC_REVIEW);
  });

  it("does not contain gate/reviewer steps", () => {
    expect(IMPL_CODE_MUTATOR_STEPS).not.toContain(STEP_NAMES.CODE_REVIEW);
    expect(IMPL_CODE_MUTATOR_STEPS).not.toContain(STEP_NAMES.CONFORMANCE);
    expect(IMPL_CODE_MUTATOR_STEPS).not.toContain(STEP_NAMES.VERIFICATION);
    expect(IMPL_CODE_MUTATOR_STEPS).not.toContain(STEP_NAMES.ADR_GEN);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-008: code-fixer ran after verification → true
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-008: codeChangedSinceLastVerification — code-fixer after verification → true", () => {
  it("returns true when code-fixer endedAt > verification endedAt", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed")],
        [STEP_NAMES.CODE_FIXER]:   [makeRun("2026-01-01T00:00:02.000Z", "approved")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(true);
  });

  it("returns true when implementer endedAt > verification endedAt", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z")],
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:02.000Z", "success")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(true);
  });

  it("returns true when build-fixer endedAt > verification endedAt", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z")],
        [STEP_NAMES.BUILD_FIXER]:  [makeRun("2026-01-01T00:00:02.000Z", "success")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(true);
  });

  it("uses the maximum endedAt across multiple mutator runs", () => {
    // Multiple code-fixer runs; only the latest matters
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeRun("2026-01-01T00:00:02.000Z"),
          makeRun("2026-01-01T00:00:04.000Z"),
        ],
        [STEP_NAMES.CODE_FIXER]: [
          makeRun("2026-01-01T00:00:01.000Z"),
          makeRun("2026-01-01T00:00:05.000Z"), // latest code-fixer after latest verification
        ],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-009: verification ran after all mutators → false
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-009: codeChangedSinceLastVerification — verification after all mutators → false", () => {
  it("returns false when verification endedAt > all mutator endedAt", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.BUILD_FIXER]:  [makeRun("2026-01-01T00:00:02.000Z", "success")],
        [STEP_NAMES.CODE_FIXER]:   [makeRun("2026-01-01T00:00:03.000Z", "approved")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:04.000Z")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });

  it("returns false when equal timestamps (vTime not strictly less than mTime)", () => {
    // Equal timestamps → mTime > vTime is false
    const ts = "2026-01-01T00:00:01.000Z";
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun(ts, "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun(ts)],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-010: verification absent, mutator present → true
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-010: codeChangedSinceLastVerification — no verification, mutator present → true", () => {
  it("returns true when there are no verification runs but implementer ran", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]: [makeRun("2026-01-01T00:00:01.000Z", "success")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(true);
  });

  it("returns true when there are no verification runs but code-fixer ran", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CODE_FIXER]: [makeRun("2026-01-01T00:00:01.000Z", "approved")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(true);
  });

  it("returns false when both mutators and verification are absent", () => {
    const state = makeBaseState({ steps: {} });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });

  it("returns false when only verification runs exist (no mutators)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z")],
      },
    });
    // mTime = "" < vTime = "2026-..." → false
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-011: non-code-mutator steps do not affect the predicate
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-011: codeChangedSinceLastVerification — non-code-mutator steps do not affect result", () => {
  it("code-review run after verification does not make predicate true", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z")],
        [STEP_NAMES.CODE_REVIEW]:  [makeRun("2026-01-01T00:00:03.000Z", "approved")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });

  it("conformance run after verification does not make predicate true", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:03.000Z", "approved")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });

  it("adr-gen run after verification does not make predicate true", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z")],
        [STEP_NAMES.ADR_GEN]:      [makeRun("2026-01-01T00:00:03.000Z", "success")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });

  it("spec-fixer run after verification does not make predicate true", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z")],
        [STEP_NAMES.SPEC_FIXER]:   [makeRun("2026-01-01T00:00:03.000Z", "approved")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });

  it("custom reviewer and regression-gate runs do not affect mTime", () => {
    // Simulates a custom reviewer run after verification but no code mutators
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z")],
        "security-reviewer":       [makeRun("2026-01-01T00:00:03.000Z", "approved")],
        "regression-gate":         [makeRun("2026-01-01T00:00:04.000Z", "approved")],
      },
    });
    expect(codeChangedSinceLastVerification(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-012: conformanceApprovedLatest — latest verdict approved → true
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-012: conformanceApprovedLatest — latest verdict approved → true", () => {
  it("returns true when last conformance run has verdict approved", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeRun("2026-01-01T00:00:01.000Z", "approved")],
      },
    });
    expect(conformanceApprovedLatest(state)).toBe(true);
  });

  it("returns true when multiple runs and last is approved", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          makeRun("2026-01-01T00:00:01.000Z", "needs-fix:code-fixer"),
          makeRun("2026-01-01T00:00:02.000Z", "approved"),
        ],
      },
    });
    expect(conformanceApprovedLatest(state)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-013: conformanceApprovedLatest — latest verdict needs-fix → false
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-013: conformanceApprovedLatest — latest verdict needs-fix → false", () => {
  it("returns false when last conformance run has verdict needs-fix:code-fixer", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeRun("2026-01-01T00:00:01.000Z", "needs-fix:code-fixer")],
      },
    });
    expect(conformanceApprovedLatest(state)).toBe(false);
  });

  it("returns false when last conformance run has plain needs-fix verdict", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeRun("2026-01-01T00:00:01.000Z", "needs-fix")],
      },
    });
    expect(conformanceApprovedLatest(state)).toBe(false);
  });

  it("returns false when multiple runs and last is needs-fix (latest wins)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          makeRun("2026-01-01T00:00:01.000Z", "approved"),
          makeRun("2026-01-01T00:00:02.000Z", "needs-fix:implementer"),
        ],
      },
    });
    expect(conformanceApprovedLatest(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-014: conformanceApprovedLatest — no conformance runs → false
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-014: conformanceApprovedLatest — no conformance runs → false", () => {
  it("returns false when there are no conformance runs", () => {
    const state = makeBaseState({ steps: {} });
    expect(conformanceApprovedLatest(state)).toBe(false);
  });

  it("returns false when conformance has empty run array", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [],
      },
    });
    expect(conformanceApprovedLatest(state)).toBe(false);
  });

  it("returns false when steps is undefined (initial state)", () => {
    const state = makeBaseState({ steps: undefined });
    expect(conformanceApprovedLatest(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-015: revisionChangedSinceLastVerification
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-015: revisionChangedSinceLastVerification — commitOid-based revision mismatch detection", () => {
  it("returns true when conformance commitOid differs from verification commitOid (human push scenario)", () => {
    // Scenario: reopen → human push → code-review clean → conformance approved
    // conformance records new commitOid; verification still has old one → reverification needed
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed", "abc123")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:03.000Z", "approved", "def456")],
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(true);
  });

  it("returns false when conformance commitOid matches verification commitOid (same revision)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed", "abc123")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:02.000Z", "approved", "abc123")],
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(false);
  });

  it("returns false (fail-closed) when verification commitOid is absent (legacy run)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed")], // no commitOid
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:02.000Z", "approved", "abc123")],
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(false);
  });

  it("returns false (fail-closed) when conformance commitOid is absent (legacy run)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed", "abc123")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:02.000Z", "approved")], // no commitOid
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(false);
  });

  it("returns false when no verification runs exist", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeRun("2026-01-01T00:00:01.000Z", "approved", "abc123")],
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(false);
  });

  it("returns false when no conformance runs exist", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed", "abc123")],
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(false);
  });

  it("uses the latest verification and conformance runs (multiple runs)", () => {
    // Latest conformance has same commitOid as latest verification — no mismatch
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [
          makeRun("2026-01-01T00:00:01.000Z", "passed", "old111"),
          makeRun("2026-01-01T00:00:03.000Z", "passed", "new222"),
        ],
        [STEP_NAMES.CONFORMANCE]: [
          makeRun("2026-01-01T00:00:02.000Z", "needs-fix:code-fixer", "old111"),
          makeRun("2026-01-01T00:00:04.000Z", "approved", "new222"),
        ],
      },
    });
    expect(revisionChangedSinceLastVerification(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-016: reverificationNeeded — composite guard (OR of both predicates)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-016: reverificationNeeded — composite OR of codeChangedSinceLastVerification and revisionChangedSinceLastVerification", () => {
  it("returns true when a specrunner mutator ran after verification (timestamp arm)", () => {
    // code-fixer ran after verification — timestamp arm fires
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed", "abc123")],
        [STEP_NAMES.CODE_FIXER]:   [makeRun("2026-01-01T00:00:02.000Z", "success", "abc123")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:03.000Z", "approved", "abc123")],
      },
    });
    expect(reverificationNeeded(state)).toBe(true);
  });

  it("returns true when a human pushed new commits and no mutator ran (commitOid arm)", () => {
    // Reopen scenario: no specrunner mutator, but verification and conformance have different commitOids
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:01.000Z", "passed", "old111")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:03.000Z", "approved", "new222")],
      },
    });
    expect(reverificationNeeded(state)).toBe(true);
  });

  it("returns false when verification is current and commitOids match (clean state, no reverification)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success", "abc123")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z", "passed", "abc123")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:03.000Z", "approved", "abc123")],
      },
    });
    expect(reverificationNeeded(state)).toBe(false);
  });

  it("returns false (fail-closed) when both commitOids are absent (legacy state, no mutator)", () => {
    // Legacy runs without commitOid: timestamp check false (verification ran after implementer),
    // commitOid check false (absent oids) → overall false → route to adr-gen (same as before fix)
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.IMPLEMENTER]:  [makeRun("2026-01-01T00:00:01.000Z", "success")],
        [STEP_NAMES.VERIFICATION]: [makeRun("2026-01-01T00:00:02.000Z", "passed")],
        [STEP_NAMES.CONFORMANCE]:  [makeRun("2026-01-01T00:00:03.000Z", "approved")],
      },
    });
    expect(reverificationNeeded(state)).toBe(false);
  });
});
