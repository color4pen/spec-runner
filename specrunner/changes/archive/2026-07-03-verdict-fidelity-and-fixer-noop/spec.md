# Spec:

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

### Requirement: regression-gate SHALL treat any fixable finding as needs-fix regardless of severity

The executor SHALL derive the regression-gate verdict using `deriveRegressionGateVerdict`, which returns `"needs-fix"` for any finding whose `resolution` is `"fixable"`, irrespective of severity level. This replaces the default `deriveJudgeVerdict` behavior that only returns `"needs-fix"` for critical/high severity.

#### Scenario: low-severity fixable finding triggers needs-fix

**Given** the regression-gate step produces a `report_result` tool call with `ok: true` and a single finding of `severity: "low"` and `resolution: "fixable"`
**When** the executor derives the verdict
**Then** the verdict is `"needs-fix"`, not `"approved"`

#### Scenario: medium-severity fixable finding triggers needs-fix

**Given** the regression-gate step produces a `report_result` tool call with `ok: true` and a single finding of `severity: "medium"` and `resolution: "fixable"`
**When** the executor derives the verdict
**Then** the verdict is `"needs-fix"`

#### Scenario: no findings yields approved

**Given** the regression-gate step produces a `report_result` tool call with `ok: true` and an empty findings array
**When** the executor derives the verdict
**Then** the verdict is `"approved"`

#### Scenario: other judge steps are unaffected

**Given** a spec-review step (not regression-gate) produces a `report_result` with `ok: true` and a single finding of `severity: "medium"` and `resolution: "fixable"`
**When** the executor derives the verdict
**Then** the verdict is `"approved"` (default `deriveJudgeVerdict` behavior unchanged)

---

### Requirement: request-review report parsing MUST succeed when findings are omitted on ok=true

`parseRequestReviewReportInput` MUST accept `{ ok: true }` (no `findings` field) as a valid parse result, treating absent findings as equivalent to an empty array. It MUST still reject a `findings` field that is present but structurally invalid.

#### Scenario: findings field absent on ok=true

**Given** a request-review agent calls `report_result` with `{ ok: true }` and no `findings` key
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: true, value: { ok: true } }` with `value.findings` being `undefined`

#### Scenario: absent findings resolves to approve verdict

**Given** `parseRequestReviewReportInput` succeeds with `value.findings === undefined`
**When** the executor derives the verdict using `deriveRequestReviewVerdict([], true)`
**Then** the verdict is `"approve"`

#### Scenario: invalid findings field still causes parse failure

**Given** a request-review agent calls `report_result` with `{ ok: true, findings: [{ severity: "invalid" }] }`
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: false, missingFields: ["findings"] }`

#### Scenario: judge step parse is unchanged

**Given** a judge step agent calls `report_result` with `{ ok: true }` and no `findings` key
**When** `parseJudgeReportInput` processes the input
**Then** the parse result is `{ ok: false }` (findings remain mandatory for judge steps)

---

### Requirement: executor SHALL override code-fixer verdict to needs-fix when no source files changed

When `noOpDetect: true` is set on a step and the step completes with verdict `"approved"`, the executor SHALL compare the current HEAD against `headBeforeStep`. If the diff contains no files outside `specrunner/changes/` and `.specrunner/` prefixes, the verdict MUST be overridden to `"needs-fix"` and a diagnostic message written to stderr.

#### Scenario: zero source file changes overrides approved to needs-fix

**Given** a code-fixer step completes with `completionReason: "success"` and `verdict: "approved"`, and `listChangedFiles` returns only `specrunner/changes/<slug>/events.jsonl`
**When** the executor applies no-op detection
**Then** the recorded verdict is `"needs-fix"` and stderr contains `[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix`

#### Scenario: source file changes preserve approved verdict

**Given** a code-fixer step completes with `verdict: "approved"` and `listChangedFiles` returns `src/foo.ts` in addition to pipeline artifacts
**When** the executor applies no-op detection
**Then** the recorded verdict remains `"approved"`

#### Scenario: noOpDetect absent disables the check

**Given** a step without `noOpDetect: true` completes with `verdict: "approved"` and zero source file changes
**When** the executor finalizes the step
**Then** no no-op override is applied and the verdict remains `"approved"`

#### Scenario: unavailable runtimeStrategy disables the check

**Given** `runtimeStrategy` is null and a code-fixer step completes with `verdict: "approved"` and zero source file changes
**When** the executor finalizes the step
**Then** no no-op override is applied

---

### Requirement: pipeline:iteration:start event SHALL carry the step-specific maxIterations

The `pipeline:iteration:start` event payload MUST use the per-step `maxIterations` value (from `resolveMaxIterations`) rather than the global `maxIterations`, so that the `/M` in `[iter N/M]` display matches the actual exhaustion threshold.

#### Scenario: regression-gate iteration display reflects step-specific limit

**Given** a pipeline with `maxIterations: 2` and `maxIterationsByStep: { "regression-gate": 3 }`, and the current step is regression-gate
**When** the pipeline emits `pipeline:iteration:start`
**Then** the event payload has `maxIterations: 3`

#### Scenario: step without override uses global value

**Given** a pipeline with `maxIterations: 2` and the current step has no per-step override
**When** the pipeline emits `pipeline:iteration:start`
**Then** the event payload has `maxIterations: 2`

---

### Requirement: archive orchestrator MUST skip git add for drafts when the directory does not exist

`runArchiveOrchestrator` MUST check whether `specrunner/drafts/` exists before running `git add` on it. If the directory is absent, the `git add` MUST be skipped entirely and no warning SHALL be emitted.

#### Scenario: drafts directory absent — git add is skipped

**Given** `fs.exists` returns `false` for the drafts directory path
**When** `runArchiveOrchestrator` reaches the draft staging phase
**Then** `spawn("git", ["add", "specrunner/drafts"])` is never called

#### Scenario: drafts directory present — git add proceeds as before

**Given** `fs.exists` returns `true` for the drafts directory path
**When** `runArchiveOrchestrator` reaches the draft staging phase
**Then** `spawn("git", ["add", "specrunner/drafts"])` is called as usual
### Requirement: The system shall place spec.md before the design step

The system SHALL place a spec.md scaffold in the change folder before the design
agent runs, so the agent has a pre-structured output destination.

#### Scenario: spec.md exists before design agent starts

**Given** the pipeline is about to execute the design step
**When** the executor calls writeOutputTemplates for the design step
**Then** spec.md exists in the change folder at specrunner/changes/<slug>/spec.md

-->

## Requirements

### Requirement: regression-gate SHALL treat any fixable finding as needs-fix regardless of severity

The executor SHALL derive the regression-gate verdict using `deriveRegressionGateVerdict`, which returns `"needs-fix"` for any finding whose `resolution` is `"fixable"`, irrespective of severity level. This replaces the default `deriveJudgeVerdict` behavior that only returns `"needs-fix"` for critical/high severity.

#### Scenario: low-severity fixable finding triggers needs-fix

**Given** the regression-gate step produces a `report_result` tool call with `ok: true` and a single finding of `severity: "low"` and `resolution: "fixable"`
**When** the executor derives the verdict
**Then** the verdict is `"needs-fix"`, not `"approved"`

#### Scenario: medium-severity fixable finding triggers needs-fix

**Given** the regression-gate step produces a `report_result` tool call with `ok: true` and a single finding of `severity: "medium"` and `resolution: "fixable"`
**When** the executor derives the verdict
**Then** the verdict is `"needs-fix"`

#### Scenario: no findings yields approved

**Given** the regression-gate step produces a `report_result` tool call with `ok: true` and an empty findings array
**When** the executor derives the verdict
**Then** the verdict is `"approved"`

#### Scenario: other judge steps are unaffected

**Given** a spec-review step (not regression-gate) produces a `report_result` with `ok: true` and a single finding of `severity: "medium"` and `resolution: "fixable"`
**When** the executor derives the verdict
**Then** the verdict is `"approved"` (default `deriveJudgeVerdict` behavior unchanged)

---

### Requirement: request-review report parsing MUST succeed when findings are omitted on ok=true

`parseRequestReviewReportInput` MUST accept `{ ok: true }` (no `findings` field) as a valid parse result, treating absent findings as equivalent to an empty array. It MUST still reject a `findings` field that is present but structurally invalid.

#### Scenario: findings field absent on ok=true

**Given** a request-review agent calls `report_result` with `{ ok: true }` and no `findings` key
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: true, value: { ok: true } }` with `value.findings` being `undefined`

#### Scenario: absent findings resolves to approve verdict

**Given** `parseRequestReviewReportInput` succeeds with `value.findings === undefined`
**When** the executor derives the verdict using `deriveRequestReviewVerdict([], true)`
**Then** the verdict is `"approve"`

#### Scenario: invalid findings field still causes parse failure

**Given** a request-review agent calls `report_result` with `{ ok: true, findings: [{ severity: "invalid" }] }`
**When** `parseRequestReviewReportInput` processes the input
**Then** the parse result is `{ ok: false, missingFields: ["findings"] }`

#### Scenario: judge step parse is unchanged

**Given** a judge step agent calls `report_result` with `{ ok: true }` and no `findings` key
**When** `parseJudgeReportInput` processes the input
**Then** the parse result is `{ ok: false }` (findings remain mandatory for judge steps)

---

### Requirement: executor SHALL override code-fixer verdict to needs-fix when no source files changed

When `noOpDetect: true` is set on a step and the step completes with verdict `"approved"`, the executor SHALL compare the current HEAD against `headBeforeStep`. If the diff contains no files outside `specrunner/changes/` and `.specrunner/` prefixes, the verdict MUST be overridden to `"needs-fix"` and a diagnostic message written to stderr.

#### Scenario: zero source file changes overrides approved to needs-fix

**Given** a code-fixer step completes with `completionReason: "success"` and `verdict: "approved"`, and `listChangedFiles` returns only `specrunner/changes/<slug>/events.jsonl`
**When** the executor applies no-op detection
**Then** the recorded verdict is `"needs-fix"` and stderr contains `[code-fixer] no-op detected: no source files changed — overriding verdict to needs-fix`

#### Scenario: source file changes preserve approved verdict

**Given** a code-fixer step completes with `verdict: "approved"` and `listChangedFiles` returns `src/foo.ts` in addition to pipeline artifacts
**When** the executor applies no-op detection
**Then** the recorded verdict remains `"approved"`

#### Scenario: noOpDetect absent disables the check

**Given** a step without `noOpDetect: true` completes with `verdict: "approved"` and zero source file changes
**When** the executor finalizes the step
**Then** no no-op override is applied and the verdict remains `"approved"`

#### Scenario: unavailable runtimeStrategy disables the check

**Given** `runtimeStrategy` is null and a code-fixer step completes with `verdict: "approved"` and zero source file changes
**When** the executor finalizes the step
**Then** no no-op override is applied

---

### Requirement: pipeline:iteration:start event SHALL carry the step-specific maxIterations

The `pipeline:iteration:start` event payload MUST use the per-step `maxIterations` value (from `resolveMaxIterations`) rather than the global `maxIterations`, so that the `/M` in `[iter N/M]` display matches the actual exhaustion threshold.

#### Scenario: regression-gate iteration display reflects step-specific limit

**Given** a pipeline with `maxIterations: 2` and `maxIterationsByStep: { "regression-gate": 3 }`, and the current step is regression-gate
**When** the pipeline emits `pipeline:iteration:start`
**Then** the event payload has `maxIterations: 3`

#### Scenario: step without override uses global value

**Given** a pipeline with `maxIterations: 2` and the current step has no per-step override
**When** the pipeline emits `pipeline:iteration:start`
**Then** the event payload has `maxIterations: 2`

---

### Requirement: archive orchestrator MUST skip git add for drafts when the directory does not exist

`runArchiveOrchestrator` MUST check whether `specrunner/drafts/` exists before running `git add` on it. If the directory is absent, the `git add` MUST be skipped entirely and no warning SHALL be emitted.

#### Scenario: drafts directory absent — git add is skipped

**Given** `fs.exists` returns `false` for the drafts directory path
**When** `runArchiveOrchestrator` reaches the draft staging phase
**Then** `spawn("git", ["add", "specrunner/drafts"])` is never called

#### Scenario: drafts directory present — git add proceeds as before

**Given** `fs.exists` returns `true` for the drafts directory path
**When** `runArchiveOrchestrator` reaches the draft staging phase
**Then** `spawn("git", ["add", "specrunner/drafts"])` is called as usual
