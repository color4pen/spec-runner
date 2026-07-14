/**
 * T-10 / T-11 / T-12: composeReviewerDescriptor unit tests.
 *
 * T-10: empty snapshots → base reference; 2 reviewers → correct shape.
 * T-11: per-step maxIterations override.
 * T-12: multiple reviewers sharing code-fixer, per-reviewer loopFixerPairs.
 */
import { describe, it, expect } from "vitest";
import { composeReviewerDescriptor } from "../compose-reviewers.js";
import { STANDARD_DESCRIPTOR } from "../registry.js";
import { STEP_NAMES } from "../../step/step-names.js";
import { REGRESSION_GATE_STEP_NAME, REGRESSION_GATE_MAX_ITERATIONS } from "../../step/regression-gate.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../types.js";
import type { ReviewerSnapshot } from "../../reviewers/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSnapshot(name: string, maxIterations = 3): ReviewerSnapshot {
  return { name, maxIterations, purpose: "p", criteria: "c", judgment: "j", freeText: "" };
}

// ---------------------------------------------------------------------------
// T-10: empty snapshots → base reference unchanged
// ---------------------------------------------------------------------------

describe("composeReviewerDescriptor — empty snapshots", () => {
  it("returns base descriptor reference when snapshots is undefined", () => {
    const result = composeReviewerDescriptor(STANDARD_DESCRIPTOR, undefined);
    expect(result).toBe(STANDARD_DESCRIPTOR);
  });

  it("returns base descriptor reference when snapshots is []", () => {
    const result = composeReviewerDescriptor(STANDARD_DESCRIPTOR, []);
    expect(result).toBe(STANDARD_DESCRIPTOR);
  });
});

// ---------------------------------------------------------------------------
// T-10: 2 reviewers → correct steps / roles / loopNames / loopFixerPairs / transitions
// ---------------------------------------------------------------------------

describe("composeReviewerDescriptor — 2 reviewers", () => {
  const snapshots = [makeSnapshot("security"), makeSnapshot("perf")];

  it("contains custom reviewer steps", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const stepNames = desc.steps.map(([name]) => name);
    expect(stepNames).toContain("security");
    expect(stepNames).toContain("perf");
  });

  it("custom reviewer steps and regression-gate are inserted before conformance", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const stepNames = desc.steps.map(([name]) => name);
    const secIdx = stepNames.indexOf("security");
    const perfIdx = stepNames.indexOf("perf");
    const gateIdx = stepNames.indexOf(REGRESSION_GATE_STEP_NAME);
    const confIdx = stepNames.indexOf(STEP_NAMES.CONFORMANCE);
    expect(secIdx).toBeLessThan(confIdx);
    expect(perfIdx).toBeLessThan(confIdx);
    expect(gateIdx).toBeLessThan(confIdx);
    // regression-gate comes after the custom reviewers
    expect(perfIdx).toBeLessThan(gateIdx);
  });

  it("contains regression-gate step", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const stepNames = desc.steps.map(([name]) => name);
    expect(stepNames).toContain(REGRESSION_GATE_STEP_NAME);
  });

  it("extends loopNames with coordinator and regression-gate (member steps excluded)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // Coordinator and regression-gate are visible to the main engine loop
    expect(desc.loopNames).toContain(CUSTOM_REVIEWERS_STEP_NAME);
    expect(desc.loopNames).toContain(REGRESSION_GATE_STEP_NAME);
    // Member steps are NOT in loopNames — they are internal to the coordinator fan-out
    expect(desc.loopNames).not.toContain("security");
    expect(desc.loopNames).not.toContain("perf");
  });

  it("extends loopFixerPairs: coordinator and gate map to code-fixer (member steps excluded)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // Coordinator maps to code-fixer; individual member steps are excluded to avoid
    // corrupting resolveActiveReviewer / episode-reset logic in the main engine loop
    expect(desc.loopFixerPairs[CUSTOM_REVIEWERS_STEP_NAME]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs[REGRESSION_GATE_STEP_NAME]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs["security"]).toBeUndefined();
    expect(desc.loopFixerPairs["perf"]).toBeUndefined();
  });

  it("extends roles: each reviewer gets role=custom-reviewer, gate gets role=gate", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.roles["security"]).toEqual({ role: "custom-reviewer", phase: "impl" });
    expect(desc.roles["perf"]).toEqual({ role: "custom-reviewer", phase: "impl" });
    expect(desc.roles[REGRESSION_GATE_STEP_NAME]).toEqual({ role: "gate", phase: "impl" });
  });

  it("coordinator has outgoing transitions (member steps have none — driven by fan-out)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // Coordinator (virtual orchestration node) appears in the transition table
    const coordinatorTrans = desc.transitions.filter((t) => t.step === CUSTOM_REVIEWERS_STEP_NAME);
    expect(coordinatorTrans.length).toBeGreaterThan(0);
    // Individual member steps have no transition rows — they are driven internally via fan-out
    const secTrans = desc.transitions.filter((t) => t.step === "security");
    expect(secTrans).toHaveLength(0);
    const perfTrans = desc.transitions.filter((t) => t.step === "perf");
    expect(perfTrans).toHaveLength(0);
  });

  it("has code-review → coordinator transition (approved, no fixable findings)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // code-review approved (no fixable findings) → coordinator (dispatches to all members in parallel)
    const row = desc.transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "approved" && t.to === CUSTOM_REVIEWERS_STEP_NAME && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("no direct member-to-member transitions exist (parallel fan-out architecture)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // In the parallel architecture, member steps are driven by the coordinator fan-out.
    // There are no direct serial transitions between member steps.
    const memberNames = snapshots.map((s) => s.name);
    const memberSet = new Set(memberNames);
    const memberTrans = desc.transitions.filter((t) => memberSet.has(t.step));
    expect(memberTrans).toHaveLength(0);
  });

  it("has coordinator → regression-gate transition (approved, last step before gate)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // coordinator approved (all members passed) → regression-gate
    const row = desc.transitions.find(
      (t) => t.step === CUSTOM_REVIEWERS_STEP_NAME && t.on === "approved" && t.to === REGRESSION_GATE_STEP_NAME && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("has regression-gate → conformance transition", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const row = desc.transitions.find(
      (t) => t.step === REGRESSION_GATE_STEP_NAME && t.on === "approved" && t.to === STEP_NAMES.CONFORMANCE && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("has regression-gate → conformance transition on skipped (empty-ledger skipWhen path)", () => {
    // regression-gate.skipWhen returns a reason when the findings ledger is empty, producing a
    // "skipped" verdict. The composed pipeline MUST route regression-gate 'skipped' to conformance,
    // otherwise an empty-ledger run halts with no matching transition. This transition row is
    // pre-existing but was dormant until skipWhen made it reachable — lock it so a future refactor
    // of buildParallelReviewerTransitions cannot silently drop it.
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const row = desc.transitions.find(
      (t) => t.step === REGRESSION_GATE_STEP_NAME && t.on === "skipped" && t.to === STEP_NAMES.CONFORMANCE,
    );
    expect(row).toBeDefined();
  });

  it("has regression-gate → code-fixer on needs-fix", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const row = desc.transitions.find(
      (t) => t.step === REGRESSION_GATE_STEP_NAME && t.on === "needs-fix" && t.to === STEP_NAMES.CODE_FIXER,
    );
    expect(row).toBeDefined();
  });

  it("base steps are preserved", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const stepNames = desc.steps.map(([name]) => name);
    for (const [baseName] of STANDARD_DESCRIPTOR.steps) {
      expect(stepNames).toContain(baseName);
    }
  });
});

// ---------------------------------------------------------------------------
// T-11: per-step maxIterations override
// ---------------------------------------------------------------------------

describe("composeReviewerDescriptor — maxIterationsByStep", () => {
  it("populates maxIterationsByStep from reviewer snapshots", () => {
    const snapshots = [makeSnapshot("security", 4), makeSnapshot("perf", 7)];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.maxIterationsByStep?.["security"]).toBe(4);
    expect(desc.maxIterationsByStep?.["perf"]).toBe(7);
  });

  it("base steps without override are absent from maxIterationsByStep", () => {
    const snapshots = [makeSnapshot("security", 2)];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // code-review has no override in base → should not appear
    expect(desc.maxIterationsByStep?.["code-review"]).toBeUndefined();
  });

  it("regression-gate has REGRESSION_GATE_MAX_ITERATIONS budget", () => {
    const snapshots = [makeSnapshot("security", 3)];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.maxIterationsByStep?.[REGRESSION_GATE_STEP_NAME]).toBe(REGRESSION_GATE_MAX_ITERATIONS);
  });
});

// ---------------------------------------------------------------------------
// T-12: many-to-one fixer — multiple reviewers share code-fixer
// ---------------------------------------------------------------------------

describe("composeReviewerDescriptor — many-to-one fixer", () => {
  it("coordinator and gate map to code-fixer (individual member steps excluded from loopFixerPairs)", () => {
    const snapshots = [makeSnapshot("sec"), makeSnapshot("perf"), makeSnapshot("style")];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // Coordinator (single fixer loop point) and regression-gate map to code-fixer
    expect(desc.loopFixerPairs[CUSTOM_REVIEWERS_STEP_NAME]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs[REGRESSION_GATE_STEP_NAME]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs[STEP_NAMES.CODE_REVIEW]).toBe(STEP_NAMES.CODE_FIXER);
    // Individual member steps are excluded: they are internal to the coordinator fan-out
    expect(desc.loopFixerPairs["sec"]).toBeUndefined();
    expect(desc.loopFixerPairs["perf"]).toBeUndefined();
    expect(desc.loopFixerPairs["style"]).toBeUndefined();
  });

  it("code-fixer step appears only once in steps", () => {
    const snapshots = [makeSnapshot("sec"), makeSnapshot("perf")];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const fixerEntries = desc.steps.filter(([name]) => name === STEP_NAMES.CODE_FIXER);
    expect(fixerEntries).toHaveLength(1);
  });
});
