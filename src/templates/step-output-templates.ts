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
import { isSpecRequired } from "../config/type-config.js";

// ---------------------------------------------------------------------------
// Template constants
// ---------------------------------------------------------------------------

/**
 * Template for request-review-result-NNN.md (A-group) — evidence report format.
 *
 * verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
 * findings は report_result（typed）で報告し、この file はその補足の evidence report である。
 */
export const REQUEST_REVIEW_RESULT_TEMPLATE = `# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     CLI の判定: decision-needed → escalation（needs-discussion）/ critical|high → needs-fix / else → approved
-->

## 検証した項目

（何をどう確認したか。読んだファイル・辿った手順・確認したコード等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
`;

/**
 * Template for spec-review-result-NNN.md (A-group) — evidence report format.
 *
 * verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
 * findings は report_result（typed）で報告し、この file はその補足の evidence report である。
 */
export const SPEC_REVIEW_RESULT_TEMPLATE = `# Spec Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     CLI の判定: decision-needed → escalation / critical|high → needs-fix / else → approved
-->

## 検証した項目

（何をどう確認したか。読んだ spec ファイル・辿った Scenario・確認した要件等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
`;

/**
 * Template for review-feedback-NNN.md (A-group) — evidence report format.
 *
 * verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
 * findings は report_result（typed）で報告し、この file はその補足の evidence report である。
 */
export const REVIEW_FEEDBACK_TEMPLATE = `# Code Review Feedback — iteration NNN

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     CLI の判定: decision-needed → escalation / critical|high → needs-fix / else → approved
-->

## 検証した項目

（何をどう確認したか。読んだファイル・辿った diff・確認したコード等を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
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
 * Machine-recognizable marker string for spec-exempt changes.
 *
 * Appears in SPEC_EXEMPT_NOTE and is imported by downstream prompt modules
 * (spec-review-system, conformance-system, design-system) so the agent can
 * recognize a spec-exempt spec.md and treat it as vacuously satisfied.
 *
 * Single source of truth — do NOT hardcode this string elsewhere.
 */
export const SPEC_EXEMPT_MARKER = "SPEC-EXEMPT";

/**
 * Content written to spec.md for spec-exempt request types (e.g. "chore").
 *
 * Requirements:
 *   (a) Non-empty and self-contained — not a scaffold placeholder.
 *   (b) Contains SPEC_EXEMPT_MARKER so downstream agents can detect exemption.
 *   (c) Clearly states that no behavior spec exists and explains why (type-driven,
 *       not an oversight).
 *   (d) Does NOT include an empty ## Requirements scaffold.
 *   (e) Instructs downstream reviewers (spec-review, conformance) not to flag
 *       the absence of Requirements / Scenarios as a finding.
 */
export const SPEC_EXEMPT_NOTE = `# Spec: (${SPEC_EXEMPT_MARKER})

<!-- ${SPEC_EXEMPT_MARKER}
この変更は request 型（chore）が spec 対象外のため、振る舞い spec（Requirement / Scenario）を持たない。
型による宣言的な免除であり、記述漏れではない。

Downstream reviewers (spec-review, conformance):
- このファイルを vacuously satisfied（conforms）として扱うこと。
- Requirement / Scenario の欠如を finding（non-conformity）にしないこと。
-->

この変更は **spec-exempt** です。request 型 (\`chore\`) は振る舞い spec の対象外のため、
Requirement および Scenario は存在しません。これは記述漏れではなく、型による宣言的な免除です。

下流レビュー（spec-review / conformance）へ: このファイルを vacuously satisfied として扱ってください。
Requirement / Scenario の欠如を finding にしないでください。
`;

/**
 * Template for conformance-result-NNN.md (A-group) — evidence report format.
 *
 * verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
 * findings は report_result（typed）で報告し、この file はその補足の evidence report である。
 */
export const CONFORMANCE_RESULT_TEMPLATE = `# Conformance Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     CLI の判定: decision-needed → escalation / critical|high → needs-fix / else → approved
-->

## 検証した項目

（何をどう確認したか。確認した tasks.md・design.md・spec.md・request.md の項目を記載する）

## 検証できなかった項目

（確認できなかった項目と理由。無ければ None と明記する）

## Findings 詳細

（typed findings の補足説明。指摘がない場合は None と明記する）
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
      // For spec-exempt types (e.g. chore), place the exemption note instead of
      // the normal spec scaffold. The design agent will leave it unchanged, and
      // the output contract gate skips spec.md for exempt types (verify: false).
      const specContent = isSpecRequired(state.request.type) ? SPEC_TEMPLATE : SPEC_EXEMPT_NOTE;
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
          content: specContent,
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
