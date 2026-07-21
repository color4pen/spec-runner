/**
 * Unit tests for the `conformanceApprovedForVerifiedRevision` guard.
 *
 * TC-001: 再走で revision が動いた stale conformance 承認は短絡しない（must）
 * TC-002: revision が動いていなければ現行どおり短絡する（must）
 * TC-003: commitOid 欠落のレガシー承認は stale 扱い（must）
 * TC-004: conformance 未実行の初回 verification は短絡しない（should）
 *
 * ⚠ RED TESTS: TC-001, TC-002, TC-003 are written in RED state.
 * `conformanceApprovedForVerifiedRevision` does not exist yet in reverification.ts
 * (T-02 not implemented). All tests will FAIL with TypeError until T-02 is merged.
 *
 * Source: specrunner/changes/approval-revision-binding/test-cases.md
 */
import { describe, it, expect } from "vitest";
import type { JobState, StepRun } from "../../../../src/state/schema.js";
import { STEP_NAMES } from "../../../../src/core/step/step-names.js";
import { conformanceApprovedForVerifiedRevision } from "../../../../src/core/pipeline/reverification.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBaseState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 1,
    jobId: "test-revision-binding",
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

function makeConformanceRun(verdict: string, commitOid?: string): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: "2026-01-01T00:01:00.000Z",
    endedAt: "2026-01-01T00:01:00.000Z",
    ...(commitOid !== undefined ? { commitOid } : {}),
  };
}

function makeVerificationRun(verdict: string, commitOid?: string): StepRun {
  return {
    attempt: 1,
    sessionId: null,
    outcome: {
      verdict: verdict as import("../../../../src/state/schema.js").Verdict,
      findingsPath: null,
      error: null,
    },
    startedAt: "2026-01-01T00:02:00.000Z",
    endedAt: "2026-01-01T00:02:00.000Z",
    ...(commitOid !== undefined ? { commitOid } : {}),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TC-001: 再走で revision が動いた stale conformance 承認は短絡しない
//
// conformance approved (commitOid = C1)
// verification passed (commitOid = C2, C2 ≠ C1)
// → guard must return false (not short-circuit to adr-gen / pr-create)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-001: stale conformance approval (C1 ≠ C2) → guard false (must)", () => {
  it("returns false when conformance.commitOid (C1) ≠ verification.commitOid (C2)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved", "sha-c1")],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c2")],
      },
    });
    // conformanceApprovedForVerifiedRevision is undefined until T-02 → TypeError → RED
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false even when there are multiple conformance runs and the last is approved but with mismatched oid", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          makeConformanceRun("needs-fix:code-fixer", "sha-old"),
          makeConformanceRun("approved", "sha-c1"),
        ],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c2")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when multiple verifications and latest has different oid than conformance", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved", "sha-c1")],
        [STEP_NAMES.VERIFICATION]: [
          makeVerificationRun("failed"),                   // no commitOid (build-fixer target)
          makeVerificationRun("passed", "sha-c2"),         // latest: different oid
        ],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-002: revision が動いていなければ現行どおり短絡する
//
// conformance approved (commitOid = C)
// verification passed (commitOid = C)   ← same SHA
// → guard must return true (short-circuit to adr-gen / pr-create)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-002: matching commitOids → guard true (must)", () => {
  it("returns true when conformance.commitOid === verification.commitOid", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved", "sha-c")],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(true);
  });

  it("returns true using the latest conformance and latest verification when both have the same oid", () => {
    const SHA = "sha-matching";
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [
          makeConformanceRun("needs-fix", "sha-old"),
          makeConformanceRun("approved", SHA),
        ],
        [STEP_NAMES.VERIFICATION]: [
          makeVerificationRun("failed"),
          makeVerificationRun("passed", SHA),
        ],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-003: commitOid 欠落のレガシー承認は stale 扱い（fail-closed）
//
// Legacy record without commitOid must be treated as "unknown = no approval".
// → guard must return false (fail-closed per D6)
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-003: missing commitOid is treated as stale (fail-closed) (must)", () => {
  it("returns false when conformance approved but has no commitOid (legacy record)", () => {
    const state = makeBaseState({
      steps: {
        // No commitOid on conformance (legacy record)
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved")],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c1")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when verification has no commitOid (legacy record)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved", "sha-c1")],
        // No commitOid on verification (legacy record or CLI step before T-01)
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when both conformance and verification have no commitOid", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved")],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when conformance commitOid is empty string (treated as absent)", () => {
    const state = makeBaseState({
      steps: {
        // Empty string commitOid on conformance
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved", "")],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c1")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when verification commitOid is empty string (treated as absent)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("approved", "sha-c1")],
        // Empty string commitOid on verification
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TC-004: conformance 未実行の初回 verification は短絡しない（should）
//
// When conformance has not run at all, guard must return false.
// ─────────────────────────────────────────────────────────────────────────────
describe("TC-004: no conformance runs → guard false (should)", () => {
  it("returns false when there are no conformance runs", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c1")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when conformance array is empty", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c1")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when steps is undefined", () => {
    const state = makeBaseState({ steps: undefined });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });

  it("returns false when latest conformance has needs-fix verdict (even with matching commitOid)", () => {
    const state = makeBaseState({
      steps: {
        [STEP_NAMES.CONFORMANCE]: [makeConformanceRun("needs-fix:code-fixer", "sha-c")],
        [STEP_NAMES.VERIFICATION]: [makeVerificationRun("passed", "sha-c")],
      },
    });
    expect(conformanceApprovedForVerifiedRevision(state)).toBe(false);
  });
});
