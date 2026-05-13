import type { StepName, ResumePoint } from "../../state/schema.js";
import { STEP_NAMES } from "../step/step-names.js";

/**
 * Abstract resume role specified via --from flag.
 */
export type ResumeRole = "critic" | "fixer" | "creator";

/**
 * Steps that belong to the spec phase.
 */
const SPEC_PHASE_STEPS = new Set<StepName>([STEP_NAMES.DESIGN, STEP_NAMES.SPEC_REVIEW, STEP_NAMES.SPEC_FIXER]);

/**
 * Steps that belong to the code phase.
 */
const CODE_PHASE_STEPS = new Set<StepName>([
  STEP_NAMES.IMPLEMENTER,
  STEP_NAMES.VERIFICATION,
  STEP_NAMES.BUILD_FIXER,
  STEP_NAMES.CODE_REVIEW,
  STEP_NAMES.CODE_FIXER,
  STEP_NAMES.PR_CREATE,
]);

/**
 * Steps that are reviewers (critic role). Used to distinguish crash from review exhaustion.
 */
const REVIEWER_STEPS = new Set<StepName>([STEP_NAMES.SPEC_REVIEW, STEP_NAMES.CODE_REVIEW]);

/**
 * Determine whether a step belongs to the spec phase.
 * Unrecognized steps default to code phase.
 */
function isSpecPhase(step: string): boolean {
  return SPEC_PHASE_STEPS.has(step as StepName);
}

/**
 * Mapping: (phase, role) → StepName
 * Design D2 mapping table.
 */
const STEP_MAPPING: Record<"spec" | "code", Record<ResumeRole, StepName>> = {
  spec: {
    critic: STEP_NAMES.SPEC_REVIEW,
    fixer: STEP_NAMES.SPEC_FIXER,
    creator: STEP_NAMES.DESIGN,
  },
  code: {
    critic: STEP_NAMES.CODE_REVIEW,
    fixer: STEP_NAMES.CODE_FIXER,
    creator: STEP_NAMES.IMPLEMENTER,
  },
};

/**
 * Resolve the concrete start step for pipeline resume.
 *
 * @param from - optional --from flag value ("critic" | "fixer" | "creator").
 *               When specified, role-based mapping takes highest priority.
 * @param resumePoint - the ResumePoint recorded in state, or null.
 *                      When null, `fallbackStep` is used to determine phase.
 * @param fallbackStep - used only when resumePoint is null to determine phase.
 *                       Must not be undefined when resumePoint is null.
 *
 * Resolution priority:
 * 1. --from specified: role-based mapping (critic/fixer/creator → phase → step)
 * 2. from undefined + resumePoint present:
 *    - REVIEWER_STEPS + iterationsExhausted > 0 → fixer (review exhaustion)
 *    - otherwise → resumePoint.step (crash: restart same step)
 * 3. from undefined + resumePoint null: fallback phase → critic step
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  fallbackStep?: string,
): StepName {
  // 1. --from explicitly specified: role-based mapping (highest priority)
  if (from !== undefined) {
    const role: ResumeRole =
      from === "fixer" ? "fixer" :
      from === "creator" ? "creator" :
      "critic";
    const phaseStep = resumePoint?.step ?? fallbackStep;
    const phase = phaseStep && isSpecPhase(phaseStep) ? "spec" : "code";
    return STEP_MAPPING[phase][role];
  }

  // 2. from undefined + resumePoint present: failure-reason-based resolution
  if (resumePoint !== null) {
    const isReviewer = REVIEWER_STEPS.has(resumePoint.step);
    if (resumePoint.iterationsExhausted > 0 && isReviewer) {
      // Review exhaustion: restart from corresponding fixer
      const phase = isSpecPhase(resumePoint.step) ? "spec" : "code";
      return STEP_MAPPING[phase]["fixer"];
    }
    // Crash/error: restart from the same step that failed
    return resumePoint.step;
  }

  // 3. from undefined + resumePoint null: fallback to critic for the phase
  const phase = fallbackStep && isSpecPhase(fallbackStep) ? "spec" : "code";
  return STEP_MAPPING[phase]["critic"];
}
