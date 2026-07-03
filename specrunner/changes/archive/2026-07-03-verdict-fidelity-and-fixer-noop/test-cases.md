# Test Cases:

<!-- FORMAT REQUIREMENTS:
Test Case heading format: `### TC-{NNN}: {Name}` (3-digit zero-padded, e.g. TC-001)

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
  ```yaml
  result: completed | partial | failed
  total: {count}
  automated: {count}
  manual: {count}
  must: {count}
  should: {count}
  could: {count}
  blocked_reasons: []
  ```

  result determination:
    completed — all testable behaviors are documented
    partial   — some cases could not be derived due to design ambiguity
    failed    — spec is absent AND design.md / tasks.md are also missing
-->

## Summary

- **Total**: 27 cases
- **Automated** (unit/integration): 25
- **Manual**: 2
- **Priority**: must: 14, should: 12, could: 1

---

## Group A: regression-gate verdict derivation (T-01 / 症状1)

### TC-001: regression-gate — low-severity fixable finding triggers needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate SHALL treat any fixable finding as needs-fix regardless of severity > Scenario: low-severity fixable finding triggers needs-fix

---

### TC-002: regression-gate — medium-severity fixable finding triggers needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate SHALL treat any fixable finding as needs-fix regardless of severity > Scenario: medium-severity fixable finding triggers needs-fix

---

### TC-003: regression-gate — no findings yields approved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate SHALL treat any fixable finding as needs-fix regardless of severity > Scenario: no findings yields approved

---

### TC-004: regression-gate — other judge steps are unaffected

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: regression-gate SHALL treat any fixable finding as needs-fix regardless of severity > Scenario: other judge steps are unaffected

---

### TC-017: deriveRegressionGateVerdict — ok=false returns escalation

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `deriveRegressionGateVerdict` is called with any `findings` array and `ok = false`
**WHEN** the function is invoked
**THEN** the return value is `"escalation"`

---

### TC-018: deriveRegressionGateVerdict — decision-needed finding returns escalation

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `deriveRegressionGateVerdict` is called with `ok = true` and a single finding of `resolution: "decision-needed"` with any severity
**WHEN** the function is invoked
**THEN** the return value is `"escalation"`

---

### TC-019: deriveRegressionGateVerdict — high-severity fixable finding returns needs-fix

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `deriveRegressionGateVerdict` is called with `ok = true` and a single finding of `severity: "high"` and `resolution: "fixable"`
**WHEN** the function is invoked
**THEN** the return value is `"needs-fix"` (same as before, but now guaranteed by the new function)

---

### TC-020: createRegressionGateStep — judgeVerdictFn is wired to deriveRegressionGateVerdict

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** `createRegressionGateStep()` is called with no arguments
**WHEN** the returned step object is inspected
**THEN** `step.judgeVerdictFn` is the same function reference as the exported `deriveRegressionGateVerdict`

---

### TC-021: executor — dispatches judgeVerdictFn for regression-gate, deriveJudgeVerdict for other judge steps

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** a regression-gate `AgentStep` with `judgeVerdictFn: deriveRegressionGateVerdict` and a spec-review `AgentStep` with no `judgeVerdictFn`
**WHEN** `finalizeStep` derives the verdict for each step after a `report_result` tool call with a medium-severity fixable finding
**THEN** the regression-gate step yields `"needs-fix"` and the spec-review step yields `"approved"`, confirming independent dispatch

---

## Group B: request-review findings parsing (T-02 / 症状2)

### TC-005: request-review — findings field absent on ok=true is parsed successfully

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review report parsing MUST succeed when findings are omitted on ok=true > Scenario: findings field absent on ok=true

---

### TC-006: request-review — absent findings resolves to approve verdict

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review report parsing MUST succeed when findings are omitted on ok=true > Scenario: absent findings resolves to approve verdict

---

### TC-007: request-review — invalid findings field still causes parse failure

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review report parsing MUST succeed when findings are omitted on ok=true > Scenario: invalid findings field still causes parse failure

---

### TC-008: request-review — judge step parse is unchanged (findings remain mandatory)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: request-review report parsing MUST succeed when findings are omitted on ok=true > Scenario: judge step parse is unchanged

---

### TC-022: parseRequestReviewReportInput — { ok: true, verdict: "approve" } without findings parses successfully

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `parseRequestReviewReportInput` receives `{ ok: true, verdict: "approve" }` (findings key absent)
**WHEN** the function processes the input
**THEN** parse result is `{ ok: true, value: { ok: true } }` with `value.findings === undefined`

---

### TC-023: parseRequestReviewReportInput — { ok: true, findings: [] } parses successfully (existing behavior preserved)

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** `parseRequestReviewReportInput` receives `{ ok: true, findings: [] }` (explicit empty array)
**WHEN** the function processes the input
**THEN** parse result is `{ ok: true, value: { ok: true, findings: [] } }` (no regression from prior behavior)

---

## Group C: code-fixer no-op detection (T-03 / 症状3)

### TC-009: code-fixer — zero source file changes overrides approved to needs-fix

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: executor SHALL override code-fixer verdict to needs-fix when no source files changed > Scenario: zero source file changes overrides approved to needs-fix

---

### TC-010: code-fixer — source file changes preserve approved verdict

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: executor SHALL override code-fixer verdict to needs-fix when no source files changed > Scenario: source file changes preserve approved verdict

---

### TC-011: code-fixer — noOpDetect absent disables the check

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: executor SHALL override code-fixer verdict to needs-fix when no source files changed > Scenario: noOpDetect absent disables the check

---

### TC-012: code-fixer — unavailable runtimeStrategy disables the check

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: executor SHALL override code-fixer verdict to needs-fix when no source files changed > Scenario: unavailable runtimeStrategy disables the check

---

### TC-024: code-fixer — multiple artifact-type changes (state.json, usage.json) count as no-op

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a code-fixer step with `noOpDetect: true` completes with `verdict: "approved"` and `listChangedFiles` returns `["specrunner/changes/my-slug/events.jsonl", "specrunner/changes/my-slug/state.json", "specrunner/changes/my-slug/usage.json"]`
**WHEN** the executor applies no-op detection (all returned files match the `specrunner/changes/` prefix filter)
**THEN** the verdict is overridden to `"needs-fix"` (artifact-only changes are treated as source-change zero)

---

### TC-025: code-fixer — noOpDetect: false disables the check

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03 Acceptance Criteria

**GIVEN** a code-fixer step with `noOpDetect: false` (explicitly disabled) completes with `verdict: "approved"` and `listChangedFiles` returns only pipeline artifact files
**WHEN** the executor finalizes the step
**THEN** no override is applied and the recorded verdict remains `"approved"`

---

## Group D: iteration display (T-04 / iter 3/2 バグ)

### TC-013: pipeline:iteration:start — regression-gate iteration display reflects step-specific limit

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: pipeline:iteration:start event SHALL carry the step-specific maxIterations > Scenario: regression-gate iteration display reflects step-specific limit

---

### TC-014: pipeline:iteration:start — step without override uses global maxIterations

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: pipeline:iteration:start event SHALL carry the step-specific maxIterations > Scenario: step without override uses global value

---

## Group E: archive orchestrator drafts warning (T-05 / 症状4)

### TC-015: archive orchestrator — drafts directory absent, git add is skipped

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: archive orchestrator MUST skip git add for drafts when the directory does not exist > Scenario: drafts directory absent — git add is skipped

---

### TC-016: archive orchestrator — drafts directory present, git add proceeds as before

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: archive orchestrator MUST skip git add for drafts when the directory does not exist > Scenario: drafts directory present — git add proceeds as before

---

## Group F: end-to-end / build verification (T-06)

### TC-026: archive — no warning output when drafts directory does not exist

**Category**: manual
**Priority**: could
**Source**: tasks.md > T-05 Acceptance Criteria

**GIVEN** a worktree where `specrunner/drafts/` does not exist
**WHEN** `job archive` is executed
**THEN** the console output contains no line matching `Warning: git add specrunner/drafts/ failed`

---

### TC-027: build pipeline — build, typecheck, lint, and tests all pass

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** all implementation changes for T-01 through T-05 are applied to the codebase
**WHEN** `bun run build && bun run typecheck && bun run lint && bun run test` is executed
**THEN** all commands exit with code 0 and no errors are reported; newly added unit tests (TC-001 through TC-025) are all green

---

## Result

```yaml
result: completed
total: 27
automated: 25
manual: 2
must: 14
should: 12
could: 1
blocked_reasons: []
```
