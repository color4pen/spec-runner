import type { StepName, ResumePoint, StepRun } from "../../state/schema.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES } from "../step/step-names.js";
import type { PipelineDescriptor } from "../pipeline/types.js";

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
 * Convert a step-name string to StepName, validating membership.
 * Throws if the name is not a registered step, so an unknown name fails loudly
 * instead of an unchecked cast producing an invalid StepName.
 */
function toStepName(name: string): StepName {
  if (!ALL_STEP_NAMES_SET.has(name)) {
    throw new Error(`Resolved step "${name}" is not a registered step name.`);
  }
  return name as StepName;
}

// ---------------------------------------------------------------------------
// Descriptor-derived helpers (pure, no I/O)
// ---------------------------------------------------------------------------

/**
 * Determine whether a step belongs to the spec phase, derived from descriptor roles.
 * Unrecognized steps default to impl phase.
 */
function isSpecPhase(descriptor: PipelineDescriptor, stepName: string): boolean {
  return (descriptor.roles[stepName]?.phase ?? "impl") === "spec";
}

/**
 * Set of reviewer step names derived from descriptor roles.
 */
function getReviewerSteps(descriptor: PipelineDescriptor): Set<string> {
  return new Set(
    Object.entries(descriptor.roles)
      .filter(([, entry]) => entry.role === "reviewer")
      .map(([name]) => name),
  );
}

/**
 * Reverse map of descriptor.loopFixerPairs: fixer step → loop step.
 * e.g. code-fixer → code-review, spec-fixer → spec-review, build-fixer → verification
 */
function getFixerToLoop(descriptor: PipelineDescriptor): Record<string, string> {
  return Object.fromEntries(
    Object.entries(descriptor.loopFixerPairs).map(([loop, fixer]) => [fixer, loop]),
  );
}

/**
 * Find the unique reviewer step for the given phase.
 * Returns undefined if no reviewer exists for that phase.
 */
function reviewerOf(descriptor: PipelineDescriptor, phase: "spec" | "impl"): string | undefined {
  return Object.entries(descriptor.roles).find(
    ([, entry]) => entry.role === "reviewer" && entry.phase === phase,
  )?.[0];
}

/**
 * Find the unique creator step for the given phase.
 * Returns undefined if no creator exists for that phase.
 */
function creatorOf(descriptor: PipelineDescriptor, phase: "spec" | "impl"): string | undefined {
  return Object.entries(descriptor.roles).find(
    ([, entry]) => entry.role === "creator" && entry.phase === phase,
  )?.[0];
}

/**
 * Build the STEP_MAPPING table from the descriptor.
 * STEP_MAPPING[phase][role] = step name.
 *
 * impl-phase fixer is uniquely determined by loopFixerPairs[reviewerOf(impl)],
 * which resolves to code-fixer (not build-fixer) for the standard pipeline.
 */
function buildStepMapping(
  descriptor: PipelineDescriptor,
): Record<"spec" | "impl", Partial<Record<LegacyResumeRole, string>>> {
  const specReviewer = reviewerOf(descriptor, "spec");
  const implReviewer = reviewerOf(descriptor, "impl");
  return {
    spec: {
      critic:  specReviewer,
      creator: creatorOf(descriptor, "spec"),
      fixer:   specReviewer !== undefined ? descriptor.loopFixerPairs[specReviewer] : undefined,
    },
    impl: {
      critic:  implReviewer,
      creator: creatorOf(descriptor, "impl"),
      fixer:   implReviewer !== undefined ? descriptor.loopFixerPairs[implReviewer] : undefined,
    },
  };
}

// ---------------------------------------------------------------------------
// resolveResumeStep
// ---------------------------------------------------------------------------

/**
 * Resolve the concrete start step for pipeline resume.
 *
 * @param descriptor - the pipeline descriptor supplying role/phase information.
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
  descriptor: PipelineDescriptor,
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
      const phase: "spec" | "impl" = phaseStep && isSpecPhase(descriptor, phaseStep) ? "spec" : "impl";
      const stepMapping = buildStepMapping(descriptor);
      const resolved = stepMapping[phase][role];
      if (resolved === undefined) {
        const phaseLabel = phase;
        const roleLabel = role === "critic" ? "reviewer" : role;
        throw new Error(
          `Cannot resolve --from "${from}": no ${roleLabel} step found in ${phaseLabel} phase ` +
          `of pipeline "${descriptor.id}". ` +
          `Check the descriptor's roles configuration.`,
        );
      }
      return toStepName(resolved);
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
      const fixerToLoop = getFixerToLoop(descriptor);
      const pairedLoop = fixerToLoop[resumePoint.step];
      if (pairedLoop !== undefined) {
        const fixerRuns = steps[resumePoint.step] ?? [];
        if (fixerRuns.length === 0) {
          // Fixer was never executed — check if paired loop step ended with needs-fix/failed
          const loopRuns = steps[pairedLoop] ?? [];
          const lastLoopRun = loopRuns[loopRuns.length - 1];
          const lastLoopVerdict = lastLoopRun !== undefined ? lastLoopRun.outcome.verdict : null;
          if (lastLoopVerdict === "needs-fix" || lastLoopVerdict === "failed") {
            return toStepName(pairedLoop);
          }
        }
      }
    }

    const reviewerSteps = getReviewerSteps(descriptor);
    const isReviewer = reviewerSteps.has(resumePoint.step);
    if (resumePoint.iterationsExhausted > 0 && isReviewer) {
      // Review exhaustion: restart from corresponding fixer
      const phase: "spec" | "impl" = isSpecPhase(descriptor, resumePoint.step) ? "spec" : "impl";
      const stepMapping = buildStepMapping(descriptor);
      const fixerStep = stepMapping[phase]["fixer"];
      if (fixerStep !== undefined) {
        return toStepName(fixerStep);
      }
    }
    // Crash/error: restart from the same step that failed
    return resumePoint.step;
  }

  // 3. from undefined + resumePoint null: fallback to critic for the phase
  const phase: "spec" | "impl" = fallbackStep && isSpecPhase(descriptor, fallbackStep) ? "spec" : "impl";
  const stepMapping = buildStepMapping(descriptor);
  const criticStep = stepMapping[phase]["critic"];
  if (criticStep !== undefined) {
    return toStepName(criticStep);
  }
  // No critic in this phase — fall back to impl critic, or throw
  const implCritic = stepMapping["impl"]["critic"];
  if (implCritic !== undefined) {
    return toStepName(implCritic);
  }
  throw new Error(
    `Cannot resolve resume step: no critic (reviewer) step found in pipeline "${descriptor.id}".`,
  );
}
