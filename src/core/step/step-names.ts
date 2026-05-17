/**
 * Canonical step name constants for the specrunner pipeline.
 * All pipeline files must reference these constants instead of string literals.
 * Single source of truth — rename here to propagate everywhere.
 */
export const STEP_NAMES = {
  DESIGN: "design",
  SPEC_REVIEW: "spec-review",
  SPEC_FIXER: "spec-fixer",
  DELTA_SPEC_VALIDATION: "delta-spec-validation",
  DELTA_SPEC_FIXER: "delta-spec-fixer",
  TEST_CASE_GEN: "test-case-gen",
  IMPLEMENTER: "implementer",
  VERIFICATION: "verification",
  BUILD_FIXER: "build-fixer",
  CODE_REVIEW: "code-review",
  CODE_FIXER: "code-fixer",
  PR_CREATE: "pr-create",
} as const;
