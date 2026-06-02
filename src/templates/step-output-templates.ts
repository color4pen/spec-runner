/**
 * Step output file templates.
 *
 * Each template is placed in the change folder before an agent step runs.
 * The agent reads the template (via Read tool) and overwrites it with its output.
 * HTML comments carry machine-parsed format requirements so agents can produce
 * correctly structured files without relying on verbose prompt instructions.
 *
 * Two placement groups:
 *   A-group: output-destination placement — agent overwrites the file. No cleanup needed.
 *   B-group: reference templates — agent reads but does NOT overwrite.
 *            cleanup: true → specrunner deletes after step completes (before commit-push).
 */

import type { JobState } from "../state/schema.js";
import {
  changeFolderPath,
  specReviewResultPath,
  reviewFeedbackPath,
} from "../util/paths.js";

// ---------------------------------------------------------------------------
// Template constants
// ---------------------------------------------------------------------------

/**
 * Template for spec-review-result-NNN.md (A-group).
 *
 * Machine-parsed fields:
 * - verdict line: `- **verdict**: <value>` at start of line
 * - Findings table: 6 columns
 */
export const SPEC_REVIEW_RESULT_TEMPLATE = `# Spec Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): \`- **verdict**: <value>\` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:    specification is complete, consistent, and ready for implementation
  - needs-fix:   specification has issues that must be resolved before implementation
  - escalation:  unresolvable conflicts, missing context, or requires human judgment
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | File | Description | How to Fix
- Valid Severity values (uppercase): CRITICAL | HIGH | MEDIUM | LOW
  - CRITICAL: production outage, data loss, security breach
  - HIGH:     functional failure, clear bug, no workaround — blocks approval
  - MEDIUM:   quality degradation, maintainability issue, future risk
  - LOW:      informational, style, minor improvement
- If no findings, write a table row with "None" or omit the table body.
- Approval is blocked when CRITICAL ≥ 1 OR HIGH ≥ 1.
-->

- **verdict**:

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
`;

/**
 * Template for review-feedback-NNN.md (A-group).
 *
 * Machine-parsed fields:
 * - verdict line: `- **verdict**: <value>`
 * - iteration line: `- **iteration**: NNN`
 * - Findings table: 7 columns (includes Fix column)
 * - Scores table: Category | Score | Weight
 * - total line: `- **total**: <weighted score>`
 */
export const REVIEW_FEEDBACK_TEMPLATE = `# Code Review Feedback — iteration NNN

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): \`- **verdict**: <value>\` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
- iteration line format (exact): \`- **iteration**: NNN\` (3-digit zero-padded integer)
- Findings table MUST have exactly 7 columns in this order:
  # | Severity | Category | File | Description | How to Fix | Fix
  - Fix column: yes = fixer should address this finding; no = skip (pre-existing / out-of-scope)
- Scores table columns: Category | Score | Weight
  - Valid Category values: correctness | security | architecture | performance | maintainability | testing
  - Score: integer 1-10
  - Weight: decimal as defined below
- total line format (exact): \`- **total**: <decimal>\`
- Default weights: correctness=0.30, security=0.25, architecture=0.15, performance=0.10, maintainability=0.10, testing=0.10
- Scores table is optional but recommended. The verdict line is the authoritative decision.
-->

- **verdict**:
- **iteration**:

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|

## Scores

| Category | Score | Weight |
|----------|-------|--------|
| correctness |  | 0.30 |
| security |  | 0.25 |
| architecture |  | 0.15 |
| performance |  | 0.10 |
| maintainability |  | 0.10 |
| testing |  | 0.10 |

- **total**:

## Summary

`;

/**
 * Template for test-cases.md (A-group).
 *
 * Machine-parsed fields:
 * - TC-NNN heading format
 * - Summary section (4 items)
 * - Result YAML block (all keys)
 */
export const TEST_CASES_TEMPLATE = `# Test Cases:

<!-- FORMAT REQUIREMENTS:
Test Case heading format: \`### TC-{NNN}: {Name}\` (3-digit zero-padded, e.g. TC-001)

Required fields per test case:
  **Category**: unit | integration | manual
  **Priority**: must | should | could
  **Source**: reference to delta spec Scenario (specs/<capability>/spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (required for each test case):
  **GIVEN** <preconditions>
  **WHEN** <action>
  **THEN** <expected result>

Category determination:
  unit        — pure logic, validation, helper functions (automated)
  integration — DB operations, API endpoints, multi-module interaction (automated)
  manual      — UI/UX confirmation, visual verification, build artifact check (not automated)

Priority determination:
  must   — core functionality; if broken, the feature does not work
  should — important but core still works; edge cases, error handling
  could  — nice to have; performance, UX details

Summary section MUST appear immediately after the title with ALL 4 items:
  ## Summary
  - **Total**: {count} cases
  - **Automated** (unit/integration): {count}
  - **Manual**: {count}
  - **Priority**: must: {count}, should: {count}, could: {count}

Result section MUST appear at the very end as a YAML code block:
  ## Result
  \`\`\`yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  \`\`\`

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — delta spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**:  cases
- **Automated** (unit/integration):
- **Manual**:
- **Priority**: must: , should: , could:
`;

/**
 * Template for design.md (A-group).
 *
 * Section structure requirements in HTML comment.
 */
export const DESIGN_TEMPLATE = `# Design:

<!-- SECTION STRUCTURE REQUIREMENTS:
Required sections (in this order):
  ## Context           — background, current state, constraints
  ## Goals / Non-Goals — what this achieves and what is explicitly excluded
  ## Decisions         — technical decisions numbered D1, D2, ...
                         Each decision MUST include:
                           - Rationale: "why X not Y"
                           - Alternatives considered
  ## Risks / Trade-offs — known risks in [Risk] → Mitigation format
  ## Open Questions    — unresolved decisions or unknowns

Optional sections:
  ## Migration Plan    — deployment steps, rollback strategy (when applicable)

Do NOT include implementation code. Focus on architecture and approach.
-->

## Context

## Goals / Non-Goals

**Goals**:

**Non-Goals**:

## Decisions

## Risks / Trade-offs

## Open Questions
`;

/**
 * Template for tasks.md (A-group).
 *
 * Task format requirements in HTML comment.
 */
export const TASKS_TEMPLATE = `# Tasks:

<!-- FORMAT REQUIREMENTS:
Task heading format: \`## T-NN: <task name>\` (2-digit zero-padded, e.g. T-01)
Sub-task format:     \`- [ ] <implementation detail>\` (checkbox)

Each task MUST end with an **Acceptance Criteria** section listing verifiable conditions.
Tasks must be granular enough for the implementer to execute without additional clarification.
-->

## T-01:

- [ ]

**Acceptance Criteria**:
-
`;

/**
 * Template for delta-spec-template.md (B-group, cleanup: true).
 *
 * Reference template placed in the change folder for the design step.
 * The agent reads this to understand the delta spec format, then writes
 * the actual delta spec under specs/<capability>/spec.md.
 * Deleted by specrunner after the design step completes (before commit-push).
 */
export const DELTA_SPEC_TEMPLATE = `<!-- DELTA SPEC FORMAT REQUIREMENTS (reference template — do NOT use this file as output)

This template describes the required format for delta spec files.
Write your delta spec at: specs/<capability-name>/spec.md

════════════════════════════════════════════════════════
STRUCTURE
════════════════════════════════════════════════════════

## Requirements
  The only top-level section for requirement additions/changes.
  Do NOT use legacy headers: ## ADDED Requirements, ## MODIFIED Requirements, etc.

### Requirement: <name>
  Each requirement. When MODIFYING an existing requirement, the header MUST
  exactly match the baseline (tool auto-classifies as MODIFIED).
  When ADDING a new requirement, use a new unique name.

#### Scenario: <name>
  At least one scenario per Requirement. Describes behavior in Given/When/Then.

## Removed
  List requirements removed from the baseline (one per line):
    - "requirement name"

## Renamed
  List requirements renamed (one per line):
    - "old name" → "new name"

════════════════════════════════════════════════════════
NORMATIVE KEYWORDS (MUST)
════════════════════════════════════════════════════════

Each Requirement body MUST contain \`SHALL\` or \`MUST\` (English normative keywords).

════════════════════════════════════════════════════════
SCENARIO FORMAT
════════════════════════════════════════════════════════

**Given** <preconditions>
**When** <action>
**Then** <expected result>

════════════════════════════════════════════════════════
FILE PATH REQUIREMENT
════════════════════════════════════════════════════════

Output file MUST be: specs/<capability-name>/spec.md
NOT:                  specs/<name>.md (flat file — invalid)

════════════════════════════════════════════════════════
EXAMPLE
════════════════════════════════════════════════════════

## Requirements

### Requirement: The system shall support template injection

The system SHALL inject output templates into the change folder before each agent step.

#### Scenario: Template placed before agent runs

**Given** the pipeline is about to execute the design step
**When** the executor invokes writeOutputTemplates for the design step
**Then** design.md, tasks.md, and delta-spec-template.md exist in the change folder

-->
`;

// ---------------------------------------------------------------------------
// Template lookup
// ---------------------------------------------------------------------------

/**
 * Template descriptor: a file path and content to write, with an optional
 * cleanup flag for B-group (reference) templates.
 */
export interface OutputTemplate {
  /** Worktree-relative path where the template should be written. */
  path: string;
  /** Template content. */
  content: string;
  /**
   * When true, specrunner deletes this file after the step completes
   * (before commit-push). Used for B-group reference templates.
   * Defaults to false (A-group: agent overwrites, no deletion needed).
   */
  cleanup?: boolean;
}

/**
 * Returns the list of output templates to place in the change folder
 * before the given agent step runs.
 *
 * Iteration numbers are computed from state.steps to handle retries correctly.
 *
 * Step → template mapping:
 *   design       → design.md (A), tasks.md (A), delta-spec-template.md (B, cleanup)
 *   spec-review  → spec-review-result-NNN.md (A)
 *   test-case-gen → test-cases.md (A)
 *   code-review  → review-feedback-NNN.md (A)
 *   all others   → [] (no templates needed)
 */
export function getOutputTemplates(
  stepName: string,
  slug: string,
  state: JobState,
): OutputTemplate[] {
  const changeFolder = changeFolderPath(slug);

  switch (stepName) {
    case "design": {
      return [
        {
          path: `${changeFolder}/design.md`,
          content: DESIGN_TEMPLATE,
        },
        {
          path: `${changeFolder}/tasks.md`,
          content: TASKS_TEMPLATE,
        },
        {
          path: `${changeFolder}/delta-spec-template.md`,
          content: DELTA_SPEC_TEMPLATE,
          cleanup: true,
        },
      ];
    }

    case "spec-review": {
      const iteration = (state.steps?.["spec-review"]?.length ?? 0) + 1;
      return [
        {
          path: specReviewResultPath(slug, iteration),
          content: SPEC_REVIEW_RESULT_TEMPLATE,
        },
      ];
    }

    case "test-case-gen": {
      return [
        {
          path: `${changeFolder}/test-cases.md`,
          content: TEST_CASES_TEMPLATE,
        },
      ];
    }

    case "code-review": {
      const iteration = (state.steps?.["code-review"]?.length ?? 0) + 1;
      return [
        {
          path: reviewFeedbackPath(slug, iteration),
          content: REVIEW_FEEDBACK_TEMPLATE,
        },
      ];
    }

    // spec-fixer, implementer, build-fixer, code-fixer, adr-gen, delta-spec-fixer:
    // no output templates needed
    default:
      return [];
  }
}
