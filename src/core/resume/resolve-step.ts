import type { StepName, ResumePoint } from "../../state/schema.js";
import { AGENT_STEP_NAMES, CLI_STEP_NAMES, toStepName, STEP_NAMES } from "../step/step-names.js";
import { REGRESSION_GATE_STEP_NAME } from "../step/regression-gate.js";
import { CUSTOM_REVIEWERS_STEP_NAME } from "../pipeline/types.js";
import { logInfo } from "../../logger/stdout.js";

/** Set of all valid step names for O(1) membership check. */
const ALL_STEP_NAMES_SET = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);

/**
 * Legacy step name aliases for backward compatibility.
 *
 * build-fixer は廃止済み。resume 復帰点（`--from build-fixer` / resumePoint.step="build-fixer"）を
 * implementer へ写すことで、旧 job の resume が壊れないようにする。
 * mapMemberToCoordinator と同じ「前段写像」パターン。
 */
const LEGACY_STEP_ALIASES: Record<string, string> = {
  "build-fixer": STEP_NAMES.IMPLEMENTER,
};

/**
 * Build the set of allowed step names for a specific job.
 *
 * Always includes the static agent and CLI step names. When custom reviewers
 * are present (reviewers.length > 0), also adds the regression-gate step name,
 * the coordinator step name, and each reviewer's member name, since these are
 * dynamically injected into the pipeline descriptor at job time.
 */
export function buildAllowedStepSet(
  reviewers?: ReadonlyArray<{ name: string }>,
): ReadonlySet<string> {
  const set = new Set<string>([...AGENT_STEP_NAMES, ...CLI_STEP_NAMES]);
  if (reviewers && reviewers.length > 0) {
    set.add(REGRESSION_GATE_STEP_NAME);
    set.add(CUSTOM_REVIEWERS_STEP_NAME);
    for (const r of reviewers) {
      set.add(r.name);
    }
  }
  return set;
}

/**
 * Map a member step name to the coordinator step name.
 *
 * When the given step matches a reviewer member name, returns CUSTOM_REVIEWERS_STEP_NAME
 * so that resume enters the coordinator (which re-evaluates pending members via
 * reviewerStatuses ledger). Non-member steps are returned unchanged.
 *
 * Exported so that ResumeCommand.prepare() can apply the same mapping when constructing
 * resumeContext — ensuring automatic context is not dropped on member→coordinator routing
 * (D3, round-immutable-input).
 *
 * @param step      - Step name to check.
 * @param reviewers - Reviewer snapshots for this job. When absent/empty, no mapping occurs.
 */
export function mapMemberToCoordinator(
  step: string,
  reviewers: ReadonlyArray<{ name: string }> | undefined,
): string {
  if (!reviewers || reviewers.length === 0) return step;
  if (reviewers.some((r) => r.name === step)) return CUSTOM_REVIEWERS_STEP_NAME;
  return step;
}

/**
 * Resolve the concrete start step for pipeline resume.
 *
 * Resolution priority:
 * 1. `from` is a registered step name (or maps to one via member→coordinator) → return it.
 * 2. `from` is defined but not a registered step → throw with available step names listed.
 * 3. `from` undefined + `resumePoint` present → map resumePoint.step (member→coordinator) and return.
 * 4. `from` undefined + `resumePoint` null + `stateStep` is a registered step name →
 *    return `toStepName(stateStep)`. This handles hard-crash recovery: `state.step` is
 *    persisted before each step executes (`executor.ts:206`), so it survives a kill -9
 *    even when no `resumePoint` was written.
 * 5. All of the above failed → throw (no resume position can be determined).
 *
 * When a member step name is detected in `from` or `resumePoint.step`, it is automatically
 * mapped to the coordinator (`custom-reviewers`) so that resume enters the fan-out loop
 * rather than attempting a standalone member step that has no transition table entry.
 *
 * @param allowedSteps - Optional set of allowed step names for this job (includes dynamic steps).
 *   When omitted, falls back to the static ALL_STEP_NAMES_SET (backward compat).
 * @param reviewers - Optional reviewer snapshots for member→coordinator mapping.
 */
export function resolveResumeStep(
  from: string | undefined,
  resumePoint: ResumePoint | null,
  stateStep?: string,
  allowedSteps?: ReadonlySet<string>,
  reviewers?: ReadonlyArray<{ name: string }>,
): StepName {
  const allowed = allowedSteps ?? ALL_STEP_NAMES_SET;

  if (from !== undefined) {
    // Apply legacy alias first (e.g. "build-fixer" → STEP_NAMES.IMPLEMENTER)
    const legacyResolved = LEGACY_STEP_ALIASES[from] ?? from;
    if (legacyResolved !== from) {
      logInfo(`Mapping --from "${from}" → "${legacyResolved}" (legacy alias)`);
    }
    const resolvedFrom = mapMemberToCoordinator(legacyResolved, reviewers);
    if (resolvedFrom !== legacyResolved) {
      logInfo(`Mapping --from "${legacyResolved}" → "${resolvedFrom}" (member → coordinator)`);
    }
    if (allowed.has(resolvedFrom)) {
      return toStepName(resolvedFrom);
    }
    const availableSteps = [...allowed].join(", ");
    throw new Error(
      `Invalid --from value: "${from}". ` +
      `Available step names: ${availableSteps}.`,
    );
  }

  if (resumePoint !== null) {
    // Apply legacy alias first (e.g. resumePoint.step="build-fixer" → STEP_NAMES.IMPLEMENTER)
    const legacyResolved = LEGACY_STEP_ALIASES[resumePoint.step] ?? resumePoint.step;
    if (legacyResolved !== resumePoint.step) {
      logInfo(`Mapping resumePoint.step "${resumePoint.step}" → "${legacyResolved}" (legacy alias)`);
    }
    const resolvedStep = mapMemberToCoordinator(legacyResolved, reviewers);
    if (resolvedStep !== legacyResolved) {
      logInfo(`Mapping resumePoint.step "${legacyResolved}" → "${resolvedStep}" (member → coordinator)`);
    }
    return toStepName(resolvedStep);
  }

  if (stateStep !== undefined && allowed.has(stateStep)) {
    return toStepName(stateStep);
  }

  throw new Error(
    "Cannot resolve resume step: no --from, no resumePoint, and no progress recorded (state.step is absent or not a pipeline step).",
  );
}
