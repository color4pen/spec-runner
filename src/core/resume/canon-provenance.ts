/**
 * Pure provenance-judgment helpers for the apply-canon gate's partial-output detection (T-02 / D2).
 *
 * Extracted to a separate module so that resume.ts can import these helpers independently
 * from apply-canon.ts. Tests that mock apply-canon.js do NOT affect these helpers.
 *
 * All functions are pure (no I/O, no side effects):
 *   - isInterruptionBacked   — does state have machine-backed interruption evidence?
 *   - declaredCanonWritesForStep — what canon paths did the interrupted step declare?
 *   - isInterruptedStepPartialCanon — are dirty canon paths fully explained by the interrupted step?
 */

import { protectedCanonPaths } from "../step/write-scope.js";
import { getPipelineDescriptor } from "../pipeline/registry.js";
import { getPipelineId } from "../../state/pipeline-id.js";
import type { JobState, ResumePoint } from "../../state/schema.js";
import type { StepDeps } from "../step/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Interruption reasons that indicate a mechanical interruption (not an operator decision).
 * Excludes "escalation" which represents an intentional decision by the pipeline or operator.
 */
export const INTERRUPTION_REASONS: ReadonlySet<string> = new Set([
  "signal",
  "timeout",
  "failure",
  "exhaustion",
]);

// ---------------------------------------------------------------------------
// isInterruptionBacked
// ---------------------------------------------------------------------------

/**
 * Return true when the resume state has mechanical backing for an interruption.
 *
 * Two independent sources count as backing:
 *   1. staleRunningDetected — process was "running" but died (SIGKILL / hard-crash).
 *   2. resumePoint.reason ∈ INTERRUPTION_REASONS — signal / timeout / failure / exhaustion.
 *
 * Escalation (reason not in INTERRUPTION_REASONS) and null resumePoint without stale detection
 * return false (operator intent, not mechanical interruption).
 */
export function isInterruptionBacked(
  resumePoint: ResumePoint | null,
  staleRunningDetected: boolean,
): boolean {
  if (staleRunningDetected) return true;
  if (resumePoint !== null && INTERRUPTION_REASONS.has(resumePoint.reason)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// declaredCanonWritesForStep
// ---------------------------------------------------------------------------

/**
 * Return the subset of a step's writes() that are protected canon paths.
 *
 * Uses the pipeline registry to look up the step definition by name, then calls
 * step.writes(state, deps) and filters the result through protectedCanonPaths(deps.slug).
 * Only paths with verify !== false are considered declared canon writes (i.e. paths the step
 * is guaranteed to produce for this request type).
 *
 * Returns [] (fail-closed) when:
 *   - The step name is not found in the pipeline descriptor.
 *   - The step has no writes() method.
 *   - Any exception is thrown during evaluation.
 *
 * @param stepName - Pipeline step name (e.g. "design").
 * @param state    - Current job state (used for getPipelineId lookup).
 * @param deps     - Step dependencies (at minimum: slug and request.type).
 */
export function declaredCanonWritesForStep(
  stepName: string,
  state: JobState,
  deps: StepDeps,
): string[] {
  try {
    const descriptor = getPipelineDescriptor(getPipelineId(state));
    const stepMap = new Map(descriptor.steps);
    const step = stepMap.get(stepName);
    if (!step) return [];
    const writes = step.writes?.(state, deps) ?? [];
    const canonSet = new Set(protectedCanonPaths(deps.slug));
    return writes
      .filter((ref) => ref.verify !== false) // exclude conditionally-skipped writes
      .map((ref) => ref.path)
      .filter((p) => canonSet.has(p));
  } catch {
    return []; // fail-closed
  }
}

// ---------------------------------------------------------------------------
// isInterruptedStepPartialCanon
// ---------------------------------------------------------------------------

/**
 * Return true when dirty canon paths are fully explained by a mechanical interruption of
 * the in-flight step (conditions 2/3/4 of D2; condition 1 is checked by the gate caller).
 *
 * All sub-conditions must hold:
 *   2. Every dirty canon path is in declaredCanonWrites (no out-of-scope paths mixed in).
 *   3. interruptionBacked — mechanical interruption evidence is present.
 *   4. completedStepRunAbsent — the step never reached a successful commit (no StepRun recorded).
 *   + dirtyCanonPaths non-empty (empty dirty set has nothing to quarantine).
 *
 * Note: condition 1 (startStep === interruptedStep) is enforced by the gate caller before
 * invoking this function.
 */
export function isInterruptedStepPartialCanon(input: {
  dirtyCanonPaths: string[];
  declaredCanonWrites: string[];
  interruptionBacked: boolean;
  completedStepRunAbsent: boolean;
}): boolean {
  const { dirtyCanonPaths, declaredCanonWrites, interruptionBacked, completedStepRunAbsent } = input;
  if (!interruptionBacked) return false;
  if (!completedStepRunAbsent) return false;
  if (dirtyCanonPaths.length === 0) return false;
  const declared = new Set(declaredCanonWrites);
  return dirtyCanonPaths.every((p) => declared.has(p));
}
