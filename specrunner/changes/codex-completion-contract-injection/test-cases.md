# Test Cases: codex-completion-contract-injection

## Summary

- **Total**: 17 cases
- **Automated** (unit/integration): 16
- **Manual**: 1
- **Priority**: must: 14, should: 3, could: 0

---

### TC-001: reportTool set — instruction present on main turn

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The codex adapter SHALL inject a completion-report instruction into the main work turn when a report tool is configured > Scenario: reportTool set — instruction present on main turn

---

### TC-002: reportTool unset — instruction absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The codex adapter SHALL inject a completion-report instruction into the main work turn when a report tool is configured > Scenario: reportTool unset — instruction absent

---

### TC-003: main-turn instruction and retry prompt share the means clause

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The completion-report means wording SHALL be single-sourced across the main turn and the retry prompt > Scenario: main-turn instruction and retry prompt share the means clause

---

### TC-004: retry prompt text is preserved

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The completion-report means wording SHALL be single-sourced across the main turn and the retry prompt > Scenario: retry prompt text is preserved

---

### TC-005: all turns fail — diagnostics persisted to the journal

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Completion-report recovery failures SHALL be recorded in the branch-borne step-attempt outcome > Scenario: all turns fail — diagnostics persisted to the journal

---

### TC-006: recovery succeeds — no diagnostics field

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Completion-report recovery failures SHALL be recorded in the branch-borne step-attempt outcome > Scenario: recovery succeeds — no diagnostics field

---

### TC-007: diagnostics survive without a session log path (inbox job)

**Category**: unit
**Priority**: should
**Source**: spec.md > Requirement: Completion-report recovery failures SHALL be recorded in the branch-borne step-attempt outcome > Scenario: diagnostics survive without a session log path (inbox job)

---

### TC-008: main turn still receives outputSchema

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The existing outputSchema path and recovery behavior SHALL NOT regress > Scenario: main turn still receives outputSchema

---

### TC-009: existing recovery scenarios stay green

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The existing outputSchema path and recovery behavior SHALL NOT regress > Scenario: existing recovery scenarios stay green

---

### TC-010: buildCompletionRetryPrompt returns exact pre-existing retry text

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `COMPLETION_REPORT_MEANS` is defined and `buildCompletionRetryPrompt` is constructed from it
**WHEN** `buildCompletionRetryPrompt(1, 2)` is called
**THEN** the returned string equals `前の応答から JSON を取得できませんでした。${COMPLETION_REPORT_MEANS} (attempt 1/2)` — identical to the literal that was previously inlined in the retry loop

---

### TC-011: stderrWrite still called on main-turn recovery failure

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** a mock thread whose main turn returns unrecoverable prose
**WHEN** `CodexAgentRunner.run()` processes the failed extraction
**THEN** `stderrWrite` is called with a message containing the failure reason (backward-compat with pre-change behavior)

---

### TC-012: stderrWrite still called on retry recovery failure

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02

**GIVEN** a mock thread where main turn and subsequent retry turns each return unrecoverable prose
**WHEN** `CodexAgentRunner.run()` processes each retry failure
**THEN** `stderrWrite` is called for each retry failure (once per failed attempt)

---

### TC-013: completionReportDiagnostics key absent from outcome when not set

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** a `pushStepResult` call where the input carries no `completionReportDiagnostics` (recovery succeeded)
**WHEN** the resulting `StepOutcome` is inspected
**THEN** the `completionReportDiagnostics` key is absent from the outcome object (not `undefined`, not `[]` — key not present)

---

### TC-014: pushStepResult with completionReportDiagnostics records it in outcome

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** a `pushStepResult` call where the input includes a non-empty `completionReportDiagnostics` array
**WHEN** the resulting `StepOutcome` is inspected
**THEN** the `completionReportDiagnostics` array in the outcome matches the input entries (each with `phase`, `failureReason`, `rawFragment`)

---

### TC-015: stepRunToRecord serializes completionReportDiagnostics

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** a step run result carrying `completionReportDiagnostics` entries
**WHEN** `stepRunToRecord` converts it to a `StepAttemptRecord`
**THEN** the serialized record's `outcome.completionReportDiagnostics` contains the same entries

---

### TC-016: fold() restores completionReportDiagnostics from a journal line

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-03

**GIVEN** a `step-attempt` journal line whose `outcome` contains a `completionReportDiagnostics` array
**WHEN** `fold()` reconstructs the outcome from that journal entry
**THEN** the reconstructed outcome's `completionReportDiagnostics` matches the entries stored in the line

---

### TC-017: typecheck passes with all new fields in place

**Category**: manual
**Priority**: must
**Source**: tasks.md > T-05

**GIVEN** the new `completionReportDiagnostics` field is present at all hops (port, state, helpers, journal, executor)
**WHEN** `bun run typecheck` is executed
**THEN** it exits with code 0 and reports zero type errors

---

## Result

```yaml
result: completed
total: 17
automated: 16
manual: 1
must: 14
should: 3
could: 0
blocked_reasons: []
```
