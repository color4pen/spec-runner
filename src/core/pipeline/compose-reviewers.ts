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
import { STEP_NAMES } from "../step/step-names.js";
import type { ReviewerSnapshot } from "../reviewers/types.js";
import { createCustomReviewerStep } from "../step/custom-reviewer.js";
import { buildReviewerChainTransitions, deriveImplReviewerChain } from "./reviewer-chain.js";

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

  // Build the full reviewer chain: ["code-review", ...custom names]
  const chain = deriveImplReviewerChain(snapshots);

  // --- Steps: insert custom reviewers after code-review, before conformance ---
  const baseSteps = [...base.steps];
  const conformanceIdx = baseSteps.findIndex(([name]) => name === STEP_NAMES.CONFORMANCE);
  const insertIdx = conformanceIdx !== -1 ? conformanceIdx : baseSteps.length;

  const customSteps = snapshots.map((snap) => [snap.name, createCustomReviewerStep(snap)] as const);
  const newSteps = [
    ...baseSteps.slice(0, insertIdx),
    ...customSteps,
    ...baseSteps.slice(insertIdx),
  ];

  // --- Transitions: replace the reviewer/fixer section with the full chain ---
  // Remove all existing code-review / code-fixer transitions from base.
  // (These are the rows produced by buildReviewerChainTransitions(["code-review"]).)
  // Then append regenerated transitions for the full chain.
  const baseTransitions = base.transitions.filter(
    (t) =>
      t.step !== STEP_NAMES.CODE_REVIEW &&
      t.step !== STEP_NAMES.CODE_FIXER &&
      !snapshots.some((s) => t.step === s.name),
  );
  const chainTransitions = buildReviewerChainTransitions(chain);

  // Insert chain transitions in place of where the code-review rows were.
  // Find the insertion index: after VERIFICATION/BUILD_FIXER, before CONFORMANCE.
  // Use the position of the first conformance row as anchor.
  const conformanceTransIdx = baseTransitions.findIndex(
    (t) => t.step === STEP_NAMES.CONFORMANCE,
  );
  const insertTransIdx = conformanceTransIdx !== -1 ? conformanceTransIdx : baseTransitions.length;

  const newTransitions = [
    ...baseTransitions.slice(0, insertTransIdx),
    ...chainTransitions,
    ...baseTransitions.slice(insertTransIdx),
  ];

  // --- loopNames: extend with custom reviewer names ---
  const newLoopNames = [...base.loopNames, ...snapshots.map((s) => s.name)];

  // --- loopFixerPairs: add reviewer → code-fixer mappings ---
  const newLoopFixerPairs = {
    ...base.loopFixerPairs,
    ...Object.fromEntries(snapshots.map((s) => [s.name, STEP_NAMES.CODE_FIXER])),
  };

  // --- roles: add reviewer / impl for each custom reviewer ---
  const newRoles = {
    ...base.roles,
    ...Object.fromEntries(
      snapshots.map((s) => [s.name, { role: "custom-reviewer" as const, phase: "impl" as const }]),
    ),
  };

  // --- maxIterationsByStep: per-reviewer budgets ---
  const newMaxIterationsByStep: Record<string, number> = {
    ...(base.maxIterationsByStep ?? {}),
    ...Object.fromEntries(snapshots.map((s) => [s.name, s.maxIterations])),
  };

  return {
    ...base,
    steps: newSteps,
    transitions: newTransitions,
    loopNames: newLoopNames,
    loopFixerPairs: newLoopFixerPairs,
    roles: newRoles,
    maxIterationsByStep: newMaxIterationsByStep,
  };
}
