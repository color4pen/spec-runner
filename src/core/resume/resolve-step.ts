import type { StepName, ResumePoint } from "../../state/schema.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, toStepName } from "../step/step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";

/** Set of all valid step names for O(1) membership check. */
const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

/**
 * Build the set of allowed step names for a specific job.
 *
 * Always includes the static agent and CLI step names. When custom reviewers
 * are present (reviewers.length > 0), also adds the regression-gate step name
 * and each reviewer's member name, since these are dynamically injected into
 * the pipeline descriptor at job time.
 */
export function buildAllowedStepSet(
  reviewers?: ReadonlyArray<{ name: string }>,
): ReadonlySet<string> {
  const set = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);
  if (reviewers && reviewers.length > 0) {
    set.add(REGRESSION_GATE_STEP_NAME);
    for (const r of reviewers) {
      set.add(r.name);
    }
  }
  return set;
}

/**
 * Resolve the concrete start step for pipeline resume.
 *
 * Resolution priority:
 * 1. `from` is a registered step name → return it directly.
 * 2. `from` is defined but not a registered step → throw with available step names listed.
 * 3. `from` undefined + `resumePoint` present → return `resumePoint.step` verbatim.
 * 4. `from` undefined + `resumePoint` null + `stateStep` is a registered step name →
 *    return `toStepName(stateStep)`. This handles hard-crash recovery: `state.step` is
 *    persisted before each step executes (`executor.ts:206`), so it survives a kill -9
 *    even when no `resumePoint` was written.
 * 5. All of the above failed → throw (no resume position can be determined).
 *
 * @param allowedSteps - Optional set of allowed step names for this job (includes dynamic steps).
 *   When omitted, falls back to the static ALL_STEP_NAMES_SET (backward compat).
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  stateStep?: string,
  allowedSteps?: ReadonlySet<string>,
): StepName {
  const allowed = allowedSteps ?? ALL_STEP_NAMES_SET;

  if (from !== undefined) {
    if (allowed.has(from)) {
      return toStepName(from);
    }
    const availableSteps = [...allowed].join(", ");
    throw new Error(
      `Invalid --from value: "${from}". ` +
      `Available step names: ${availableSteps}.`,
    );
  }

  if (resumePoint !== null) {
    return resumePoint.step;
  }

  if (stateStep !== undefined && allowed.has(stateStep)) {
    return toStepName(stateStep);
  }

  throw new Error(
    "Cannot resolve resume step: no --from, no resumePoint, and no progress recorded (state.step is absent or not a pipeline step).",
  );
}
