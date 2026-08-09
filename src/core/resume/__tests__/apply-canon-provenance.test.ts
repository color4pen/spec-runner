/**
 * Unit tests for provenance helper functions added in T-02.
 *
 * TC-011: isInterruptionBacked — stale 検出で true を返す
 * TC-012: isInterruptionBacked — 全 4 interruption reason で true を返す
 * TC-013: isInterruptionBacked — escalation reason で false を返す
 * TC-014: isInterruptionBacked — resumePoint=null かつ stale=false で false を返す
 * TC-015: declaredCanonWritesForStep("design") — isSpecRequired=true で全 3 paths を返す
 * TC-016 (should): declaredCanonWritesForStep("design") — isSpecRequired=false で spec.md を含まない
 * TC-017: declaredCanonWritesForStep("unknown-step-xyz") — [] を返す (fail-closed)
 * TC-018: isInterruptedStepPartialCanon — 4 条件すべて成立で true
 * TC-019: isInterruptedStepPartialCanon — 宣言外 canon 混在で false (条件 2 不成立)
 * TC-020: isInterruptedStepPartialCanon — interruptionBacked=false で false (条件 3 不成立)
 * TC-021: isInterruptedStepPartialCanon — completedStepRunAbsent=false で false (条件 4 不成立)
 * TC-022: isInterruptedStepPartialCanon — dirtyCanonPaths=[] で false
 *
 * Tests are intentionally RED until T-02 adds the exports to apply-canon.ts.
 * Uses namespace import + type cast to avoid TypeScript errors on non-existing exports.
 */

import { describe, it, expect } from "vitest";
import * as applyCanonModule from "../apply-canon.js";
import type { JobState } from "../../../state/schema.js";
import { protectedCanonPaths } from "../../step/write-scope.js";

// ---------------------------------------------------------------------------
// Cast to access not-yet-implemented exports (T-02)
// After implementation, these will resolve normally.
// ---------------------------------------------------------------------------

type ResumePointLike = { step: string; reason: string; iterationsExhausted: number } | null;

const {
  isInterruptionBacked,
  declaredCanonWritesForStep,
  isInterruptedStepPartialCanon,
} = applyCanonModule as unknown as {
  isInterruptionBacked: (rp: ResumePointLike, stale: boolean) => boolean;
  declaredCanonWritesForStep: (stepName: string, state: JobState, deps: unknown) => string[];
  isInterruptedStepPartialCanon: (input: {
    dirtyCanonPaths: string[];
    declaredCanonWrites: string[];
    interruptionBacked: boolean;
    completedStepRunAbsent: boolean;
  }) => boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_SLUG = "unit-test-provenance-slug";

function makeMinimalState(overrides: Partial<JobState> = {}): JobState {
  return {
    version: 2,
    jobId: "job-provenance-unit-test",
    createdAt: "2026-08-09T00:00:00.000Z",
    updatedAt: "2026-08-09T00:00:00.000Z",
    request: {
      path: `specrunner/changes/${TEST_SLUG}/request.md`,
      title: "Provenance unit test",
      type: "spec-change",
      slug: TEST_SLUG,
    },
    repository: { owner: "test", name: "repo" },
    session: null,
    step: "design",
    status: "awaiting-resume",
    branch: `change/${TEST_SLUG}`,
    history: [],
    error: null,
    steps: {},
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// TC-011: isInterruptionBacked — stale 検出で true を返す
// ---------------------------------------------------------------------------

describe("TC-011: isInterruptionBacked — stale 検出で true を返す", () => {
  it("TC-011: returns true when staleRunningDetected=true and resumePoint=null", () => {
    // GIVEN
    // WHEN
    const result = isInterruptionBacked(null, true);
    // THEN
    expect(result).toBe(true);
  });

  it("TC-011: stale=true is sufficient regardless of resumePoint", () => {
    const rp = { step: "design", reason: "escalation", iterationsExhausted: 0 };
    // stale=true overrides the escalation reason → still true
    expect(isInterruptionBacked(rp, true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-012: isInterruptionBacked — 全 4 interruption reason で true を返す
// ---------------------------------------------------------------------------

describe("TC-012: isInterruptionBacked — 全 4 interruption reason で true を返す", () => {
  const interruptionReasons = ["signal", "timeout", "failure", "exhaustion"] as const;

  for (const reason of interruptionReasons) {
    it(`TC-012: returns true for resumePoint.reason="${reason}"`, () => {
      // GIVEN
      const rp: ResumePointLike = { step: "design", reason, iterationsExhausted: 0 };
      // WHEN
      const result = isInterruptionBacked(rp, false);
      // THEN
      expect(result, `isInterruptionBacked must return true for reason="${reason}"`).toBe(true);
    });
  }

  it("TC-012: stale=true + valid interruption reason → still true", () => {
    const rp = { step: "design", reason: "signal", iterationsExhausted: 0 };
    expect(isInterruptionBacked(rp, true)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-013: isInterruptionBacked — escalation reason で false を返す
// ---------------------------------------------------------------------------

describe("TC-013: isInterruptionBacked — escalation reason で false を返す", () => {
  it("TC-013: returns false when resumePoint.reason='escalation' and stale=false", () => {
    // GIVEN
    const rp = { step: "design", reason: "escalation", iterationsExhausted: 0 };
    // WHEN
    const result = isInterruptionBacked(rp, false);
    // THEN
    expect(result, "escalation is NOT an interruption-backed reason").toBe(false);
  });

  it("TC-013: returns false for any reason not in {signal,timeout,failure,exhaustion}", () => {
    for (const reason of ["completed", "unknown", "abort", "cancel"]) {
      const rp = { step: "design", reason, iterationsExhausted: 0 };
      expect(isInterruptionBacked(rp, false), `expected false for reason="${reason}"`).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// TC-014: isInterruptionBacked — resumePoint=null かつ stale=false で false を返す
// ---------------------------------------------------------------------------

describe("TC-014: isInterruptionBacked — resumePoint=null かつ stale=false で false を返す", () => {
  it("TC-014: returns false when both stale=false and resumePoint=null", () => {
    // GIVEN / WHEN / THEN
    expect(isInterruptionBacked(null, false)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-015: declaredCanonWritesForStep("design") — isSpecRequired=true で全 3 paths を返す
// ---------------------------------------------------------------------------

describe("TC-015: declaredCanonWritesForStep('design') — isSpecRequired=true で design.md / tasks.md / spec.md を返す", () => {
  const state = makeMinimalState({ request: { path: "", title: "", type: "spec-change", slug: TEST_SLUG } });
  const deps = { slug: TEST_SLUG, request: { type: "spec-change" } };
  const FOLDER = `specrunner/changes/${TEST_SLUG}`;

  it("TC-015: returns design.md, tasks.md, spec.md for spec-change (isSpecRequired=true)", () => {
    // WHEN
    const result = declaredCanonWritesForStep("design", state, deps);
    // THEN
    expect(result).toContain(`${FOLDER}/design.md`);
    expect(result).toContain(`${FOLDER}/tasks.md`);
    expect(result).toContain(`${FOLDER}/spec.md`);
  });

  it("TC-015: all returned paths are protected canon paths (no non-canon contamination)", () => {
    const result = declaredCanonWritesForStep("design", state, deps);
    const canonSet = new Set(protectedCanonPaths(TEST_SLUG));
    for (const p of result) {
      expect(canonSet.has(p), `${p} must be in protectedCanonPaths`).toBe(true);
    }
  });

  it("TC-015: does not include src/ paths or other non-canon paths", () => {
    const result = declaredCanonWritesForStep("design", state, deps);
    expect(result.every((p) => p.startsWith("specrunner/changes/"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-016 (should): declaredCanonWritesForStep — isSpecRequired=false で spec.md を含まない
// ---------------------------------------------------------------------------

describe("TC-016 (should): declaredCanonWritesForStep — isSpecRequired=false で spec.md を含まない", () => {
  it("TC-016: returns design.md and tasks.md but NOT spec.md for bug-fix (isSpecRequired=false)", () => {
    // GIVEN: chore type → isSpecRequired=false (bug-fix has specRequired=true in TYPE_CONFIG)
    const state = makeMinimalState({ request: { path: "", title: "", type: "chore", slug: TEST_SLUG } });
    const deps = { slug: TEST_SLUG, request: { type: "chore" } };
    const FOLDER = `specrunner/changes/${TEST_SLUG}`;
    // WHEN
    const result = declaredCanonWritesForStep("design", state, deps);
    // THEN
    expect(result).toContain(`${FOLDER}/design.md`);
    expect(result).toContain(`${FOLDER}/tasks.md`);
    expect(
      result,
      "spec.md should NOT be included for bug-fix when isSpecRequired=false",
    ).not.toContain(`${FOLDER}/spec.md`);
  });
});

// ---------------------------------------------------------------------------
// TC-017: declaredCanonWritesForStep — 未知 step 名で [] を返す (fail-closed)
// ---------------------------------------------------------------------------

describe("TC-017: declaredCanonWritesForStep — 未知 step 名で [] を返す (fail-closed)", () => {
  it("TC-017: returns [] for an unknown step name (not in pipeline)", () => {
    // GIVEN
    const state = makeMinimalState();
    const deps = { slug: TEST_SLUG, request: { type: "spec-change" } };
    // WHEN
    const result = declaredCanonWritesForStep("unknown-step-xyz", state, deps);
    // THEN: fail-closed — unknown step has no declared writes
    expect(result).toEqual([]);
  });

  it("TC-017: does NOT throw for unknown step name — returns [] gracefully", () => {
    const state = makeMinimalState();
    const deps = { slug: TEST_SLUG, request: { type: "spec-change" } };
    let threw = false;
    let result: string[] | undefined;
    try {
      result = declaredCanonWritesForStep("nonexistent-step", state, deps);
    } catch {
      threw = true;
    }
    expect(threw, "must not throw — fail-closed means return [], not exception").toBe(false);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// TC-018: isInterruptedStepPartialCanon — 4 条件すべて成立で true
// ---------------------------------------------------------------------------

describe("TC-018: isInterruptedStepPartialCanon — 4 条件すべて成立で true を返す", () => {
  const FOLDER = `specrunner/changes/${TEST_SLUG}`;

  it("TC-018: returns true when all 4 conditions are satisfied (all dirty paths are declared)", () => {
    // GIVEN: dirty = subset of declared, interruption backed, no completed StepRun
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: true,
    };
    // WHEN
    const result = isInterruptedStepPartialCanon(input);
    // THEN
    expect(result).toBe(true);
  });

  it("TC-018: returns true with a single dirty canon path that is declared", () => {
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: true,
    };
    expect(isInterruptedStepPartialCanon(input)).toBe(true);
  });

  it("TC-018: returns true when dirty paths exactly match declared writes", () => {
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: true,
    };
    expect(isInterruptedStepPartialCanon(input)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// TC-019: isInterruptedStepPartialCanon — 宣言外 canon 混在で false (条件 2 不成立)
// ---------------------------------------------------------------------------

describe("TC-019: isInterruptedStepPartialCanon — 宣言外 canon 混在で false を返す (条件 2 不成立)", () => {
  const FOLDER = `specrunner/changes/${TEST_SLUG}`;

  it("TC-019: returns false when dirty paths include test-cases.md (outside design writes())", () => {
    // GIVEN: test-cases.md is NOT in design's writes() — operator edit suspected
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`, `${FOLDER}/test-cases.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: true,
    };
    // WHEN
    const result = isInterruptedStepPartialCanon(input);
    // THEN: condition 2 fails — test-cases.md is outside design's declared writes
    expect(result, "must return false when any dirty path is outside declaredCanonWrites").toBe(false);
  });

  it("TC-019: returns false even when only 1 out of N dirty paths is out-of-scope (fail-closed)", () => {
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/request.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: true,
    };
    // request.md is in protectedCanonPaths but NOT in design's writes
    expect(isInterruptedStepPartialCanon(input)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-020: isInterruptedStepPartialCanon — interruptionBacked=false で false (条件 3 不成立)
// ---------------------------------------------------------------------------

describe("TC-020: isInterruptedStepPartialCanon — interruptionBacked=false で false を返す (条件 3 不成立)", () => {
  const FOLDER = `specrunner/changes/${TEST_SLUG}`;

  it("TC-020: returns false when interruptionBacked=false (no mechanical interruption evidence)", () => {
    // GIVEN: escalation / operator edit after normal completion — no interruption backing
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: false,
      completedStepRunAbsent: true,
    };
    // WHEN
    const result = isInterruptedStepPartialCanon(input);
    // THEN: condition 3 fails — no machine-backed interruption evidence
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-021: isInterruptedStepPartialCanon — completedStepRunAbsent=false で false (条件 4 不成立)
// ---------------------------------------------------------------------------

describe("TC-021: isInterruptedStepPartialCanon — completedStepRunAbsent=false で false を返す (条件 4 不成立)", () => {
  const FOLDER = `specrunner/changes/${TEST_SLUG}`;

  it("TC-021: returns false when design has a completed StepRun (escalation / normal completion)", () => {
    // GIVEN: design step DID complete at some point (state.steps["design"] is non-empty)
    const input = {
      dirtyCanonPaths: [`${FOLDER}/design.md`],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: false, // step completed → dirty canon is likely operator edit
    };
    // WHEN
    const result = isInterruptedStepPartialCanon(input);
    // THEN: condition 4 fails — escalation / normal completion leaves a StepRun
    expect(result).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TC-022: isInterruptedStepPartialCanon — dirtyCanonPaths=[] で false
// ---------------------------------------------------------------------------

describe("TC-022: isInterruptedStepPartialCanon — dirtyCanonPaths=[] で false を返す", () => {
  const FOLDER = `specrunner/changes/${TEST_SLUG}`;

  it("TC-022: returns false when dirtyCanonPaths is empty (nothing to quarantine)", () => {
    // GIVEN: no dirty canon paths exist
    const input = {
      dirtyCanonPaths: [],
      declaredCanonWrites: [`${FOLDER}/design.md`, `${FOLDER}/tasks.md`, `${FOLDER}/spec.md`],
      interruptionBacked: true,
      completedStepRunAbsent: true,
    };
    // WHEN
    const result = isInterruptedStepPartialCanon(input);
    // THEN: empty dirty paths → no partial output → not a quarantine candidate
    expect(result).toBe(false);
  });
});
