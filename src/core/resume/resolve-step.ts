import type { StepName, ResumePoint } from "../../state/schema.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../step/step-names.js";

/** Set of all valid step names for O(1) membership check. */
const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

/**
 * Resolve the concrete start step for pipeline resume.
 *
 * Resolution priority:
 * 1. `from` is a registered step name → return it directly.
 * 2. `from` is defined but not a registered step → throw with available step names listed.
 * 3. `from` undefined + `resumePoint` present → return `resumePoint.step` verbatim.
 * 4. `from` undefined + `resumePoint` null → throw (defensive invariant; caller should guard).
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
): StepName {
  if (from !== undefined) {
    if (ALL_STEP_NAMES_SET.has(from)) {
      return from as StepName;
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

  throw new Error(
    "Cannot resolve resume step: resumePoint is null and --from is not specified.",
  );
}
