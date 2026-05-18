/**
 * Delta spec path / format validator.
 *
 * Detects legacy-path and format violations in a change folder's delta spec files.
 * Fully injectable (DI for readdir/readFile) so it can be tested without real fs.
 *
 * Design D1: no I/O imports at module level — all fs access goes through deps.
 * Design D2: changePath is the absolute (or resolved) path to the change folder.
 */

/**
 * Reason codes for delta spec violations.
 *
 * - legacy-flat-file: `<change>/delta-spec.md` or `<change>/specs/<name>.delta.md`
 * - legacy-flat-dir: `<change>/delta-spec/<capability>.md`
 * - non-canonical-path: `<change>/specs/<name>.md` placed directly in specs/ without subdir
 * - missing-requirements-section: canonical path but no ADDED/MODIFIED/REMOVED section header
 * - empty-section: section header present but no Requirement block found
 */
export type DeltaSpecViolationReason =
  | "legacy-flat-file"
  | "legacy-flat-dir"
  | "non-canonical-path"
  | "missing-requirements-section"
  | "empty-section"
  | "no-specs-for-required-type";

export interface DeltaSpecViolation {
  path: string;
  reason: DeltaSpecViolationReason;
  /** Human-readable suggested fix (optional). */
  suggested?: string;
}

/** Injectable filesystem interface for the validator (subset of FinishFs). */
export interface DeltaSpecValidatorFs {
  readdir(path: string): Promise<string[]>;
  readFile(path: string): Promise<string>;
}

import { noSpecsForRequiredType, createDeltaSpecRegistry } from "./rules/index.js";

/**
 * Validate delta spec paths and file contents under `changePath`.
 *
 * @param changePath - Absolute path to the change folder (e.g. `/work/specrunner/changes/my-change`)
 * @param deps - Injectable fs operations for testing
 * @param requestType - Request type from request.md Meta section. When "spec-change" or "new-feature", specs/ must contain at least one .md file.
 * @returns `{ ok: true }` when all checks pass; `{ ok: false, violations }` otherwise
 */
export async function validateDeltaSpecPaths(
  changePath: string,
  deps: DeltaSpecValidatorFs,
  requestType?: string,
): Promise<{ ok: true } | { ok: false; violations: DeltaSpecViolation[] }> {
  const ruleInput = { changePath, deps, requestType };

  // D9: no-specs-for-required-type runs first with early return
  const specsViolations = await noSpecsForRequiredType.check(ruleInput);
  if (specsViolations.length > 0) {
    return { ok: false, violations: specsViolations };
  }

  // Run remaining rules via registry
  const registry = createDeltaSpecRegistry();
  const violations = await registry.validate(ruleInput);

  return violations.length > 0 ? { ok: false, violations } : { ok: true };
}
