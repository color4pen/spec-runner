import type { StepName, ResumePoint } from "../../state/schema.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, toStepName } from "../step/step-names.js";

/** Set of all valid step names for O(1) membership check. */
const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

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
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  stateStep?: string,
): StepName {
  if (from !== undefined) {
    if (ALL_STEP_NAMES_SET.has(from)) {
      return toStepName(from);
    }
    const availableSteps = [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ");
    throw new Error(
      `Invalid --from value: "${from}". ` +
      `Available step names: ${availableSteps}.`,
    );
  }

  if (resumePoint !== null) {
    return resumePoint.step;
  }

  if (stateStep !== undefined && ALL_STEP_NAMES_SET.has(stateStep)) {
    return toStepName(stateStep);
  }

  throw new Error(
    "Cannot resolve resume step: no --from, no resumePoint, and no progress recorded (state.step is absent or not a pipeline step).",
  );
}
