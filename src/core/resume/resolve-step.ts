import type { StepName, ResumePoint, StepRun } from "../../state/schema.js";
import { STEP_NAMES, AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../step/step-names.js";
import { DesignStep } from "../step/design.js";
import { SpecReviewStep } from "../step/spec-review.js";
import { SpecFixerStep } from "../step/spec-fixer.js";
import { TestCaseGenStep } from "../step/test-case-gen.js";
import { ImplementerStep } from "../step/implementer.js";
import { BuildFixerStep } from "../step/build-fixer.js";
import { CodeReviewStep } from "../step/code-review.js";
import { CodeFixerStep } from "../step/code-fixer.js";
import { STANDARD_LOOP_FIXER_PAIRS } from "../pipeline/run.js";

/**
 * Legacy resume role aliases accepted by --from flag (for backward compatibility).
 */
export type LegacyResumeRole = "critic" | "fixer" | "creator";

/** @deprecated Use LegacyResumeRole instead */
export type ResumeRole = LegacyResumeRole;

/** Tuple of all legacy alias values, used for runtime membership checks. */
export const LEGACY_RESUME_ROLES = ["critic", "fixer", "creator"] as const;

/**
 * All values accepted by the --from flag: any pipeline step name or a legacy alias.
 */
export type ResumeFrom = StepName | LegacyResumeRole;

/** Set of all valid step names for O(1) membership check. */
const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

/**
 * Reverse map of STANDARD_LOOP_FIXER_PAIRS: fixer step → loop step.
 * e.g. { "code-fixer": "code-review", "spec-fixer": "spec-review", "build-fixer": "verification", ... }
 */
const FIXER_TO_LOOP: Record<string, string> = Object.fromEntries(
  Object.entries(STANDARD_LOOP_FIXER_PAIRS).map(([loop, fixer]) => [fixer, loop]),
);

/**
 * Phase map derived from step definitions.
 * Keys are step names; values are the declared phase (defaulting to "impl").
 * Replaces the hardcoded SPEC_PHASE_STEPS and CODE_PHASE_STEPS Sets.
 */
const STEP_PHASE_MAP = new Map<string, "spec" | "impl">(
  [DesignStep, SpecReviewStep, SpecFixerStep,
   TestCaseGenStep, ImplementerStep, BuildFixerStep, CodeReviewStep, CodeFixerStep]
  .map(s => [s.name, s.phase ?? "impl"]),
);

/**
 * Steps that are reviewers (critic role). Used to distinguish crash from review exhaustion.
 */
const REVIEWER_STEPS = new Set<StepName>([STEP_NAMES.SPEC_REVIEW, STEP_NAMES.CODE_REVIEW]);

/**
 * Determine whether a step belongs to the spec phase.
 * Unrecognized steps default to code (impl) phase.
 */
function isSpecPhase(stepName: string): boolean {
  return STEP_PHASE_MAP.get(stepName) === "spec";
}

/**
 * Mapping: (phase, role) → StepName
 * Design D2 mapping table.
 */
const STEP_MAPPING: Record<"spec" | "code", Record<LegacyResumeRole, StepName>> = {
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
 * @param steps - optional step journal from job state (`state.steps`).
 *                When provided, enables Tier 2a fixer-empty detection.
 *
 * Resolution priority:
 * 1. --from specified: role-based mapping (critic/fixer/creator → phase → step)
 * 2. from undefined + resumePoint present:
 *    2a. Fixer-empty detection (requires `steps`):
 *        - resumePoint.step is a fixer step (code-fixer / spec-fixer / build-fixer / ...)
 *        - AND state.steps[fixer] is empty (fixer never ran — kill happened after transition)
 *        - AND paired loop step's last verdict is needs-fix or failed
 *        → resume from the paired loop step (code-review / spec-review / verification / ...)
 *    2b. REVIEWER_STEPS + iterationsExhausted > 0 → fixer (review exhaustion)
 *    2c. otherwise → resumePoint.step (crash: restart same step)
 * 3. from undefined + resumePoint null: fallback phase → critic step
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  fallbackStep?: string,
  steps?: Record<string, StepRun[]>,
): StepName {
  // 1. --from explicitly specified (highest priority)
  if (from !== undefined) {
    // 1a. Step name directly: return as-is without phase mapping
    if (ALL_STEP_NAMES_SET.has(from)) {
      return from as StepName;
    }
    // 1b. Legacy alias: phase-aware mapping (backward-compatible)
    if (from === "fixer" || from === "creator" || from === "critic") {
      const role: LegacyResumeRole = from;
      const phaseStep = resumePoint?.step ?? fallbackStep;
      const phase = phaseStep && isSpecPhase(phaseStep) ? "spec" : "code";
      return STEP_MAPPING[phase][role];
    }
    // 1c. Unknown value: throw with available values listed
    const availableSteps = [...AGENT_STEP_NAMES, ...CLI_STEP_NAMES].join(", ");
    const availableAliases = LEGACY_RESUME_ROLES.join(", ");
    throw new Error(
      `Invalid --from value: "${from}". ` +
      `Available step names: ${availableSteps}. ` +
      `Legacy aliases: ${availableAliases}.`,
    );
  }

  // 2. from undefined + resumePoint present: failure-reason-based resolution
  if (resumePoint !== null) {
    // 2a. Fixer-empty detection: resumePoint points to a fixer step but fixer never ran.
    // This happens when the pipeline transitioned from loop step → fixer but was killed
    // before fixer could execute. Resume should go back to the loop step (reviewer) instead.
    if (steps !== undefined) {
      const pairedLoop = FIXER_TO_LOOP[resumePoint.step];
      if (pairedLoop !== undefined) {
        const fixerRuns = steps[resumePoint.step] ?? [];
        if (fixerRuns.length === 0) {
          // Fixer was never executed — check if paired loop step ended with needs-fix/failed
          const loopRuns = steps[pairedLoop] ?? [];
          const lastLoopRun = loopRuns[loopRuns.length - 1];
          const lastLoopVerdict = lastLoopRun !== undefined ? lastLoopRun.outcome.verdict : null;
          if (lastLoopVerdict === "needs-fix" || lastLoopVerdict === "failed") {
            return pairedLoop as StepName;
          }
        }
      }
    }

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
