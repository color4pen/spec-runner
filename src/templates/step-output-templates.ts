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
  requestReviewResultPath,
  specReviewResultPath,
  reviewFeedbackPath,
  conformanceResultPath,
} from "../util/paths.js";

// ---------------------------------------------------------------------------
// Template constants
// ---------------------------------------------------------------------------

/**
 * Template for request-review-result-NNN.md (A-group).
 *
 * Machine-parsed fields:
 * - verdict line: `- **verdict**: <value>` at start of line
 * - Findings table: 6 columns
 */
export const REQUEST_REVIEW_RESULT_TEMPLATE = `# Request Review Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- The verdict line MUST appear before the Findings table.
- verdict line format (exact): \`- **verdict**: <value>\` at the start of a line
- Valid verdict values: approve | needs-discussion | reject
  - approve:          No HIGH severity findings. Request is ready for pipeline execution.
  - needs-discussion: One or more HIGH severity findings resolvable through discussion.
  - reject:           Multiple HIGH findings AND requirement contradictions or structural breakdown.
- Findings table MUST have exactly 6 columns in this order:
  # | Severity | Category | Location | Description | Recommendation
- Valid Severity values (uppercase): HIGH | MEDIUM | LOW
  - HIGH:   Request-level defect — goal unclear, acceptance criteria absent/untestable, or critical external constraint unspecified
  - MEDIUM: Scope ambiguity, recommended additions
  - LOW:    Clarity improvements, expression refinements
- Approval is blocked when HIGH ≥ 1.
-->

- **verdict**:

## Findings

| # | Severity | Category | Location | Description | Recommendation |
|---|----------|----------|----------|-------------|----------------|
`;

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
  **Source**: reference to spec Scenario (spec.md > Requirement: <name> > Scenario: <name>) or design.md / tasks.md section

GIVEN/WHEN/THEN structure (mixed format — depends on TC type):
  Scenario 由来 TC (Source = spec.md > Requirement: <name> > Scenario: <name>):
    GWT は記述しない。Source 参照のみ。behavior の正典は spec の Scenario。
  非 Scenario 由来 TC (Source = design.md or tasks.md section):
    GWT は必須:
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
    failed    — spec is absent AND design.md / tasks.md are also missing
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
 * Template for spec.md (A-group).
 *
 * Placed in the change folder before the design step runs.
 * The agent overwrites this file with the self-contained spec for the change.
 * HTML comments carry writing guidance for Requirement / Scenario structure.
 */
export const SPEC_TEMPLATE = `# Spec:

<!-- SPEC WRITING GUIDANCE

This file is the self-contained spec for this change.
Write Layer-1 behaviors — choices the structure/types/FSM do not enforce automatically.

════════════════════════════════════════════════════════
REQUIREMENT FORMAT
════════════════════════════════════════════════════════

### Requirement: <name>

Each requirement describes a behavior this change introduces or modifies.
The body MUST contain a normative keyword: SHALL or MUST (English).

At least one Scenario per Requirement (Given/When/Then format):

#### Scenario: <name>

**Given** <preconditions>
**When** <action>
**Then** <expected result>

════════════════════════════════════════════════════════
EXAMPLE
════════════════════════════════════════════════════════

## Requirements

### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

`;

/**
 * Template for conformance-result-NNN.md (A-group).
 *
 * Placed in the change folder before the conformance step runs. The agent
 * overwrites it with the per-artifact conformance findings and verdict.
 */
export const CONFORMANCE_RESULT_TEMPLATE = `# Conformance Result

<!-- FORMAT REQUIREMENTS (machine-parsed):
- verdict line format (exact): \`- **verdict**: <value>\` at the start of a line
- Valid verdict values: approved | needs-fix | escalation
  - approved:   implementation conforms to tasks.md, design.md, spec.md, and request.md
  - needs-fix:  one or more upstream artifacts are not satisfied by the implementation
  - escalation: conformance cannot be determined (missing artifacts, unresolvable ambiguity)
- The Findings table records the per-artifact judgment.
-->

- **verdict**:

## Conformance Findings

| Artifact | Conforms | Notes |
|----------|----------|-------|
| tasks.md |  |  |
| design.md |  |  |
| spec.md |  |  |
| request.md |  |  |
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
 *   design       → design.md (A), tasks.md (A), spec.md (A)
 *   spec-review  → spec-review-result-NNN.md (A)
 *   test-case-gen → test-cases.md (A)
 *   code-review  → review-feedback-NNN.md (A)
 *   conformance  → conformance-result-NNN.md (A)
 *   all others   → [] (no templates needed)
 */
export function getOutputTemplates(
  stepName: string,
  slug: string,
  state: JobState,
): OutputTemplate[] {
  const changeFolder = changeFolderPath(slug);

  switch (stepName) {
    case "request-review": {
      const iteration = (state.steps?.["request-review"]?.length ?? 0) + 1;
      return [
        {
          path: requestReviewResultPath(slug, iteration),
          content: REQUEST_REVIEW_RESULT_TEMPLATE,
        },
      ];
    }

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
          path: `${changeFolder}/spec.md`,
          content: SPEC_TEMPLATE,
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

    case "conformance": {
      const iteration = (state.steps?.["conformance"]?.length ?? 0) + 1;
      return [
        {
          path: conformanceResultPath(slug, iteration),
          content: CONFORMANCE_RESULT_TEMPLATE,
        },
      ];
    }

    // spec-fixer, implementer, build-fixer, code-fixer, adr-gen:
    // no output templates needed
    default:
      return [];
  }
}
