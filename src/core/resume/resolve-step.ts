import type { StepName, ResumePoint } from "../../state/schema.js";

/**
 * Abstract resume role specified via --from flag.
 */
export type ResumeRole = "critic" | "fixer" | "creator";

/**
 * Steps that belong to the spec phase.
 */
const SPEC_PHASE_STEPS = new Set<StepName>(["propose", "spec-review", "spec-fixer"]);

/**
 * Steps that belong to the code phase.
 */
const CODE_PHASE_STEPS = new Set<StepName>([
  "implementer",
  "verification",
  "build-fixer",
  "code-review",
  "code-fixer",
  "pr-create",
]);

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
    critic: "spec-review",
    fixer: "spec-fixer",
    creator: "propose",
  },
  code: {
    critic: "code-review",
    fixer: "code-fixer",
    creator: "implementer",
  },
};

/**
 * Resolve the concrete start step for pipeline resume.
 *
 * @param from - optional --from flag value ("critic" | "fixer" | "creator").
 *               Defaults to "critic" when undefined.
 * @param resumePoint - the ResumePoint recorded in state, or null.
 *                      When null, `fallbackStep` is used to determine phase.
 * @param fallbackStep - used only when resumePoint is null to determine phase.
 *                       Must not be undefined when resumePoint is null.
 *
 * Design D2: phase is derived from resumePoint.step (or fallbackStep when null).
 * "critic" default: if from is undefined, defaults to "critic".
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  fallbackStep?: string,
): StepName {
  const role: ResumeRole =
    from === "fixer" ? "fixer" :
    from === "creator" ? "creator" :
    "critic"; // default

  // Determine which step to use for phase detection
  const phaseStep = resumePoint?.step ?? fallbackStep;

  // Determine phase: spec or code
  const phase = phaseStep && isSpecPhase(phaseStep) ? "spec" : "code";

  return STEP_MAPPING[phase][role];
}
