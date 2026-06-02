import type { DeltaSpecRule, DeltaSpecRuleName, DeltaSpecRuleInput } from "./types.js";
import type { DeltaSpecViolation } from "../delta-spec-validator.js";

/** Prefix that identifies authority (baseline) spec files. */
const AUTHORITY_SPEC_PREFIX = "specrunner/specs/";

/** Prefix for delta specs (under changes folder) — not violations. */
const DELTA_SPEC_PREFIX = "specrunner/changes/";

/**
 * Detects direct edits to authority (baseline) spec files.
 *
 * Scans `input.changedFiles` (repo-root-relative paths from `git diff`) for
 * any path that starts with `specrunner/specs/` but NOT `specrunner/changes/`.
 *
 * Rationale: authority specs are read-only during a PR. They must only be
 * updated via `specrunner finish`. Direct edits by agents must
 * be rolled back and the intended changes moved to the delta spec path.
 *
 * When `changedFiles` is undefined (git diff unavailable), the rule is skipped
 * (graceful degradation — no false positives).
 */
export const noAuthoritySpecDirectEdit: DeltaSpecRule<DeltaSpecRuleName> = {
  name: "no-authority-spec-direct-edit",
  severity: "error",
  async check(input: DeltaSpecRuleInput): Promise<DeltaSpecViolation[]> {
    if (input.changedFiles === undefined) {
      return [];
    }

    const violations: DeltaSpecViolation[] = [];
    for (const filePath of input.changedFiles) {
      if (
        filePath.startsWith(AUTHORITY_SPEC_PREFIX) &&
        !filePath.startsWith(DELTA_SPEC_PREFIX)
      ) {
        violations.push({
          path: filePath,
          reason: "authority-spec-direct-edit",
          suggested:
            "Revert with git checkout and move changes to specrunner/changes/<slug>/specs/<capability>/spec.md",
        });
      }
    }
    return violations;
  },
};
