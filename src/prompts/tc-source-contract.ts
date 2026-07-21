/**
 * TC Source step 間契約の正準形式定数。project-internal import なし（leaf）。
 *
 * Single source of truth for the TC Source field format used as the step-to-step
 * contract between test-case-gen (producer) and test-materialize / implementer (consumers).
 *
 * All three step prompts import TC_SOURCE_SCENARIO_FORMAT from this module.
 * This module has no project-internal imports (leaf — no circular dependencies).
 */

/**
 * Canonical format string for the TC Source field when the test case derives from a spec Scenario.
 *
 * Format: `spec.md > Requirement: <name> > Scenario: <name>`
 * Points to the change folder's spec.md (specrunner/changes/<slug>/spec.md).
 */
export const TC_SOURCE_SCENARIO_FORMAT = "spec.md > Requirement: <name> > Scenario: <name>";
