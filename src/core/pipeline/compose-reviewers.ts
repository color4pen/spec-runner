/**
 * Compose a PipelineDescriptor with custom reviewer steps.
 *
 * Given a base descriptor (STANDARD_DESCRIPTOR) and a list of reviewer snapshots
 * from job state, produces a new descriptor with:
 *   - Custom reviewer steps inserted after code-review, before conformance.
 *   - Transitions regenerated for the full reviewer chain.
 *   - loopNames and loopFixerPairs extended with custom reviewers.
 *   - roles extended (reviewer / impl phase) for each custom reviewer.
 *   - maxIterationsByStep populated from each reviewer's maxIterations.
 *
 * Invariant: when snapshots is empty, returns the base descriptor unchanged
 * (reference-identical) for zero-overhead no-reviewer case.
 */
import type { PipelineDescriptor } from "./types.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "./types.js";
import { STEP_NAMES } from "../step/step-names.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";
import { createCustomReviewerStep } from "../step/custom-reviewer.js";
import { createRegressionGateStep, REGRESSION_GATE_STEP_NAME, REGRESSION_GATE_MAX_ITERATIONS } from "../step/regression-gate.js";
import { buildParallelReviewerTransitions } from "./reviewer-chain.js";

/**
 * Build a PipelineDescriptor that incorporates the given reviewer snapshots.
 *
 * When `snapshots` is empty (or absent), returns `base` unchanged (same reference).
 * This preserves the "zero reviewers = no overhead" invariant.
 *
 * @param base      - The standard pipeline descriptor.
 * @param snapshots - Custom reviewer snapshots from JobState.reviewers.
 */
export function composeReviewerDescriptor(
  base: PipelineDescriptor,
  snapshots: ReviewerSnapshot[] | undefined,
): PipelineDescriptor {
  if (!snapshots || snapshots.length === 0) {
    return base;
  }

  const coordinator = CUSTOM_REVIEWERS_STEP_NAME;
  const memberNames = snapshots.map((s) => s.name);

  // --- Steps: insert custom reviewers + regression-gate before conformance ---
  // The coordinator is a virtual node managed by the engine — NOT in the steps Map.
  const baseSteps = [...base.steps];
  const conformanceIdx = baseSteps.findIndex(([name]) => name === STEP_NAMES.CONFORMANCE);
  const insertIdx = conformanceIdx !== -1 ? conformanceIdx : baseSteps.length;

  const customSteps = snapshots.map((snap) => [snap.name, createCustomReviewerStep(snap)] as const);
  const gateStep = [REGRESSION_GATE_STEP_NAME, createRegressionGateStep()] as const;
  const newSteps = [
    ...baseSteps.slice(0, insertIdx),
    ...customSteps,
    gateStep,
    ...baseSteps.slice(insertIdx),
  ];

  // --- Transitions: replace the reviewer/fixer section with parallel coordinator transitions ---
  // Remove all existing code-review / code-fixer / custom reviewer / regression-gate transitions from base.
  const baseTransitions = base.transitions.filter(
    (t) =>
      t.step !== STEP_NAMES.CODE_REVIEW &&
      t.step !== STEP_NAMES.CODE_FIXER &&
      t.step !== REGRESSION_GATE_STEP_NAME &&
      !snapshots.some((s) => t.step === s.name),
  );
  const parallelTransitions = buildParallelReviewerTransitions({ coordinator, members: memberNames });

  // Insert parallel transitions in place of where the code-review rows were.
  const conformanceTransIdx = baseTransitions.findIndex(
    (t) => t.step === STEP_NAMES.CONFORMANCE,
  );
  const insertTransIdx = conformanceTransIdx !== -1 ? conformanceTransIdx : baseTransitions.length;

  const newTransitions = [
    ...baseTransitions.slice(0, insertTransIdx),
    ...parallelTransitions,
    ...baseTransitions.slice(insertTransIdx),
  ];

  // --- loopNames: extend with coordinator + regression-gate ---
  // Design D4: coordinator is registered as a loop step for exhaustion / episode-reset tracking.
  // Member steps are NOT added to loopNames: they never appear as currentStep or nextStep in
  // the main engine loop (they run inside runCoordinatorFanOut fan-out, not via transitions).
  const newLoopNames = [
    ...base.loopNames,
    coordinator,
    REGRESSION_GATE_STEP_NAME,
  ];

  // --- loopFixerPairs ---
  // Only the coordinator (not individual members) maps to code-fixer.
  // Members are internal to the coordinator fan-out; the engine never routes to them directly.
  // Including members in loopFixerPairs would cause resolvePairedReviewForFixer to consider
  // member startedAt times, corrupting the episode-reset logic and preventing exhaustion.
  const newLoopFixerPairs = {
    ...base.loopFixerPairs,
    [coordinator]: STEP_NAMES.CODE_FIXER,
    [REGRESSION_GATE_STEP_NAME]: STEP_NAMES.CODE_FIXER,
  };

  // --- roles ---
  // coordinator: gate / impl (virtual orchestration node)
  // members: custom-reviewer / impl
  // regression-gate: gate / impl
  const newRoles = {
    ...base.roles,
    [coordinator]: { role: "gate" as const, phase: "impl" as const },
    ...Object.fromEntries(
      snapshots.map((s) => [s.name, { role: "custom-reviewer" as const, phase: "impl" as const }]),
    ),
    [REGRESSION_GATE_STEP_NAME]: { role: "gate" as const, phase: "impl" as const },
  };

  // --- maxIterationsByStep ---
  // coordinator: max of member maxIterations (Open Question initial policy: member max)
  const memberMaxIterations = snapshots.map((s) => s.maxIterations);
  const coordinatorMaxIterations = memberMaxIterations.length > 0
    ? Math.max(...memberMaxIterations)
    : 3; // fallback default

  const newMaxIterationsByStep: Record<string, number> = {
    ...(base.maxIterationsByStep ?? {}),
    [coordinator]: coordinatorMaxIterations,
    ...Object.fromEntries(snapshots.map((s) => [s.name, s.maxIterations])),
    [REGRESSION_GATE_STEP_NAME]: REGRESSION_GATE_MAX_ITERATIONS,
  };

  return {
    ...base,
    steps: newSteps,
    transitions: newTransitions,
    loopNames: newLoopNames,
    loopFixerPairs: newLoopFixerPairs,
    roles: newRoles,
    maxIterationsByStep: newMaxIterationsByStep,
    parallelReview: { coordinator, members: memberNames },
  };
}
