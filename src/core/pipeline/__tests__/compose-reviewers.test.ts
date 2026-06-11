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

  it("extends loopNames with custom reviewer names and regression-gate", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.loopNames).toContain("security");
    expect(desc.loopNames).toContain("perf");
    expect(desc.loopNames).toContain(REGRESSION_GATE_STEP_NAME);
  });

  it("extends loopFixerPairs: each reviewer and gate map to code-fixer", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.loopFixerPairs["security"]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs["perf"]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs[REGRESSION_GATE_STEP_NAME]).toBe(STEP_NAMES.CODE_FIXER);
  });

  it("extends roles: each reviewer gets role=custom-reviewer, gate gets role=gate", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.roles["security"]).toEqual({ role: "custom-reviewer", phase: "impl" });
    expect(desc.roles["perf"]).toEqual({ role: "custom-reviewer", phase: "impl" });
    expect(desc.roles[REGRESSION_GATE_STEP_NAME]).toEqual({ role: "gate", phase: "impl" });
  });

  it("has transitions for custom reviewers", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const secTrans = desc.transitions.filter((t) => t.step === "security");
    expect(secTrans.length).toBeGreaterThan(0);
  });

  it("has code-review → security transition in chain", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    // code-review approved (no fixable) → security (next in chain)
    const row = desc.transitions.find(
      (t) => t.step === STEP_NAMES.CODE_REVIEW && t.on === "approved" && t.to === "security" && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("has security → perf transition in chain", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const row = desc.transitions.find(
      (t) => t.step === "security" && t.on === "approved" && t.to === "perf" && !t.when,
    );
    expect(row).toBeDefined();
  });

  it("has perf → regression-gate transition (last custom reviewer → gate)", () => {
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const row = desc.transitions.find(
      (t) => t.step === "perf" && t.on === "approved" && t.to === REGRESSION_GATE_STEP_NAME && !t.when,
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
  it("all reviewers in loopFixerPairs map to the same code-fixer", () => {
    const snapshots = [makeSnapshot("sec"), makeSnapshot("perf"), makeSnapshot("style")];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    expect(desc.loopFixerPairs["sec"]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs["perf"]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs["style"]).toBe(STEP_NAMES.CODE_FIXER);
    expect(desc.loopFixerPairs[STEP_NAMES.CODE_REVIEW]).toBe(STEP_NAMES.CODE_FIXER);
  });

  it("code-fixer step appears only once in steps", () => {
    const snapshots = [makeSnapshot("sec"), makeSnapshot("perf")];
    const desc = composeReviewerDescriptor(STANDARD_DESCRIPTOR, snapshots);
    const fixerEntries = desc.steps.filter(([name]) => name === STEP_NAMES.CODE_FIXER);
    expect(fixerEntries).toHaveLength(1);
  });
});
