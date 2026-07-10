/**
 * Pure warning generator for scope-config empty detection.
 *
 * No side effects — no logging, no I/O.
 * Callers (e.g. CommandRunner.execute) are responsible for emitting the warning.
 *
 * Design rationale:
 *   A pipeline that declares permissionScope but has no resolved forbidden surfaces
 *   performs no scope breach detection, even though users may expect it to.
 *   Emitting a warning at job start makes this gap explicit without blocking execution.
 *   forbidden = [] is a valid config (repo has no protected surfaces) — we warn, not fail.
 */
import type { PipelineDescriptor } from "./types.js";
import { applyScopeConfig } from "./resolve-scope.js";
import { getPipelineDescriptor } from "./registry.js";
import { getPipelineId } from "../../state/pipeline-id.js";
import type { JobState } from "../../state/schema.js";
import type { SpecRunnerConfig } from "../../config/schema.js";

/**
 * Return a warning string when the descriptor declares permissionScope but has no
 * resolved forbidden surfaces, or null when no warning is needed.
 *
 * Cases:
 *   - permissionScope absent             → null (standard / design-only: no scope checking)
 *   - permissionScope present, forbidden ≥ 1 → null (scope breach detection is active)
 *   - permissionScope present, forbidden = 0 → warning string
 *
 * The descriptor passed here should be the config-resolved descriptor (output of
 * applyScopeConfig), not the static registry descriptor, so that the judgment
 * reflects the actual resolved state.
 *
 * Pure function: no logging or I/O side effects.
 */
export function scopeConfigEmptyWarning(descriptor: PipelineDescriptor): string | null {
  if (descriptor.permissionScope === undefined) {
    return null;
  }
  if (descriptor.permissionScope.forbidden.length > 0) {
    return null;
  }
  return (
    `Pipeline '${descriptor.id}' declares a permissionScope but no forbidden surfaces are configured. ` +
    `Scope breach detection is effectively disabled for this run. ` +
    `To enable detection, set pipeline.${descriptor.id}.forbiddenSurfaces in your .specrunner/config.json.`
  );
}

/**
 * Resolve the config-applied descriptor for the job's pipeline and return a scope
 * config warning string, or null if no warning is needed.
 *
 * Delegates to scopeConfigEmptyWarning after applying config-resolved forbidden surfaces.
 * Pure function: no logging or I/O side effects.
 */
export function scopeConfigWarningForJob(
  jobState: JobState,
  config: SpecRunnerConfig,
): string | null {
  const pipelineId = getPipelineId(jobState);
  const base = getPipelineDescriptor(pipelineId);
  const scoped = applyScopeConfig(base, config);
  return scopeConfigEmptyWarning(scoped);
}
