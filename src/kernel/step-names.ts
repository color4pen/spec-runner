/**
 * Canonical step name constants for the specrunner pipeline.
 * All pipeline files must reference these constants instead of string literals.
 * Single source of truth — rename here to propagate everywhere.
 */

/**
 * Whitelist of step names that run as AI agent sessions.
 * AgentStepName is derived from this array — add new agent steps here.
 */
export const AGENT_STEP_NAMES = [
  "design",
  "spec-review",
  "spec-fixer",
  "test-case-gen",
  "implementer",
  "build-fixer",
  "code-review",
  "code-fixer",
  "conformance",
  "adr-gen",
] as const;

/**
 * Whitelist of step names that run as deterministic CLI processes.
 * CliStepName is derived from this array — add new CLI steps here.
 */
export const CLI_STEP_NAMES = [
  "verification",
  "pr-create",
] as const;

export const STEP_NAMES = {
  DESIGN: "design",
  SPEC_REVIEW: "spec-review",
  SPEC_FIXER: "spec-fixer",
  TEST_CASE_GEN: "test-case-gen",
  IMPLEMENTER: "implementer",
  VERIFICATION: "verification",
  BUILD_FIXER: "build-fixer",
  CODE_REVIEW: "code-review",
  CODE_FIXER: "code-fixer",
  CONFORMANCE: "conformance",
  ADR_GEN: "adr-gen",
  PR_CREATE: "pr-create",
} as const;
