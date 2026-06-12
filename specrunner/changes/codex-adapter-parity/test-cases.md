# Test Cases: codex-adapter-parity

## Summary

- **Total**: 26 cases
- **Automated** (unit/integration): 25
- **Manual**: 1
- **Priority**: must: 18, should: 8, could: 0

---

## Transient Retry — Main Turn

### TC-001: main turn transient error retries then succeeds

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL auto-retry transient errors on the main work turn > Scenario: transient error on the main turn retries then succeeds

---

### TC-002: main turn persistent transient error halts after budget

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL auto-retry transient errors on the main work turn > Scenario: persistent transient error on the main turn halts after the budget

---

### TC-011: transient error injected via `turn.failed` event shape retries correctly

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-09

**GIVEN** a step whose `runStreamed` yields a `turn.failed` event with a transient message (e.g. `"fetch failed"`) on the first call, then succeeds on the second
**AND** `transientRetry.maxRetries = 2`
**WHEN** `CodexAgentRunner.run()` executes the step
**THEN** `completionReason` is `"success"`
**AND** `transientRetryAttempts` is `1`
**AND** exactly one `step:retry` event was emitted

---

### TC-012: abort signal suppresses transient retry

**Category**: unit
**Priority**: must
**Source**: design.md > D2 / tasks.md > T-04

**GIVEN** a step whose main turn raises a transient error
**AND** `transientRetry.maxRetries = 3`
**AND** the abort controller's signal is aborted before the retry check evaluates
**WHEN** `CodexAgentRunner.run()` evaluates `isTransientError`
**THEN** no retry is attempted and the step halts without emitting `step:retry`

---

## Transient Retry — Follow-up Turns

### TC-003: postWorkPrompts follow-up turn transient error retries then succeeds

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL auto-retry transient errors on follow-up turns > Scenario: transient error on a postWorkPrompts follow-up turn retries then succeeds

---

### TC-026: typed-outcome follow-up turn transient error retries and accumulates attempts

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-09

**GIVEN** a step whose main turn succeeds and whose first typed-outcome retry turn raises a transient error once then succeeds
**AND** `transientRetry.maxRetries = 3`
**WHEN** `CodexAgentRunner.run()` processes the step
**THEN** `completionReason` is `"success"`
**AND** `transientRetryAttempts` is at least `1`
**AND** at least one `step:retry` event was emitted

---

## Non-Retry Boundary Conditions

### TC-004: non-transient error fails on the first attempt

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL NOT retry non-transient errors > Scenario: non-transient error fails on the first attempt

---

### TC-005: maxRetries = 0 disables the retry feature

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL NOT retry non-transient errors > Scenario: maxRetries = 0 disables the feature

---

### TC-013: `transientRetryAttempts` absent from result when `maxRetries = 0`

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `transientRetry.maxRetries = 0`
**AND** the main turn raises any error
**WHEN** `CodexAgentRunner.run()` returns
**THEN** the returned `AgentRunResult` does not contain a `transientRetryAttempts` property

---

### TC-014: `transientRetryAttempts` present on error result when `maxRetries > 0`

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-04

**GIVEN** `transientRetry.maxRetries = 3`
**AND** the main turn raises a non-transient error (no retry occurs)
**WHEN** `CodexAgentRunner.run()` returns
**THEN** the returned `AgentRunResult` contains `transientRetryAttempts = 0`

---

## JSONL Logging

### TC-006: logPath set produces a JSONL file

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL write a JSONL verbose log only when logPath is set > Scenario: logPath set produces a JSONL file

---

### TC-007: logPath unset produces no file

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL write a JSONL verbose log only when logPath is set > Scenario: logPath unset produces no file

---

### TC-019: session log writeSummary written on error exit path

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-03

**GIVEN** `ctx.session.logPath` is set to a writable path
**AND** the main turn raises a non-transient error
**WHEN** `CodexAgentRunner.run()` terminates via the error catch branch
**THEN** the JSONL file exists and contains a summary line (i.e. `writeSummary` was called before `close`)

---

## step:progress Observability

### TC-008: command_execution item.started emits step:progress

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL emit step:progress as the agent uses tools > Scenario: a command execution emits step:progress

---

### TC-015: file_change item.started emits step:progress with tool "Edit"

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03

**GIVEN** a step whose turn yields an `item.started` event for a `file_change` item with a changed path
**WHEN** `CodexAgentRunner.run()` processes the event
**THEN** a `step:progress` event is emitted with `tool = "Edit"` and `target` equal to the first changed path

---

### TC-016: mcp_tool_call item.started emits step:progress with tool name and server

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03

**GIVEN** a step whose turn yields an `item.started` event for an `mcp_tool_call` item with tool name `"read_file"` and server `"filesystem"`
**WHEN** `CodexAgentRunner.run()` processes the event
**THEN** a `step:progress` event is emitted with `tool = "read_file"` and `target = "filesystem"`

---

### TC-017: web_search item.started emits step:progress with tool "WebSearch"

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03

**GIVEN** a step whose turn yields an `item.started` event for a `web_search` item with a query string
**WHEN** `CodexAgentRunner.run()` processes the event
**THEN** a `step:progress` event is emitted with `tool = "WebSearch"` and `target` equal to the query

---

### TC-018: non-tool item.started does not emit step:progress

**Category**: unit
**Priority**: should
**Source**: design.md > D4 / tasks.md > T-03

**GIVEN** a step whose turn yields `item.started` events only for `agent_message` and reasoning-type items
**WHEN** `CodexAgentRunner.run()` processes these events
**THEN** no `step:progress` event is emitted

---

## Output Verification Repair Loop

### TC-009: detected follow-up violation triggers a repair turn

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: CodexAgentRunner SHALL run the output-verification repair loop > Scenario: a detected follow-up violation triggers a repair turn

---

### TC-021: repair-turn failure is best-effort, work-turn result preserved

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-06

**GIVEN** `ctx.policy.outputVerification.detect()` returns a `follow-up` violation
**AND** a session was established (threadId present)
**AND** the repair turn's `runStreamed` rejects with an error
**WHEN** `CodexAgentRunner.run()` processes the output-verification stage
**THEN** `completionReason` reflects the work-turn result (no halt)
**AND** no unhandled error propagates from the repair failure

---

### TC-022: outputVerification repair loop bounded by maxAttempts

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-06

**GIVEN** `ctx.policy.outputVerification.detect()` persistently returns a `follow-up` violation on every call
**AND** `outputVerification.maxAttempts = 2`
**AND** each repair turn succeeds
**WHEN** `CodexAgentRunner.run()` runs the repair loop
**THEN** exactly 2 repair turns are sent and the loop exits

---

## outputSchema Injection

### TC-020: outputSchema passed for main/typed-outcome turns, absent for postWork/repair turns

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-05

**GIVEN** a step with `outputSchema` set, `postWorkPrompts` configured, and `outputVerification` configured
**WHEN** `CodexAgentRunner.run()` executes all turn types
**THEN** `runStreamed` receives `outputSchema` in opts for the main turn and typed-outcome retry turns
**AND** `runStreamed` receives no `outputSchema` for postWorkPrompts turns and output-verification repair turns

---

## Shared Module Extraction

### TC-023: isTransientAgentError re-export shim: existing claude-code tests pass unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-01

**GIVEN** `src/adapter/claude-code/transient-error.ts` is replaced with a re-export shim pointing to `src/adapter/shared/transient-error.ts`
**WHEN** the existing `tests/adapter/claude-code/transient-error.test.ts` suite runs
**THEN** all tests pass without any modification to the test file

---

### TC-024: SessionLogWriter re-export shim: existing claude-code tests pass unchanged

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02

**GIVEN** `src/adapter/claude-code/session-log-writer.ts` is replaced with a re-export shim pointing to `src/adapter/shared/session-log-writer.ts`
**WHEN** the existing `tests/adapter/claude-code/session-log-writer.test.ts` suite runs
**THEN** all tests pass without any modification to the test file

---

## jsdoc Correctness

### TC-010: jsdoc no longer claims ClaudeCodeRunner exclusivity

**Category**: manual
**Priority**: must
**Source**: spec.md > Requirement: Stale jsdoc SHALL describe local runtime runners, not ClaudeCodeRunner only > Scenario: jsdoc no longer claims ClaudeCodeRunner exclusivity

---

## Regression — Pre-existing Codex Behaviors

### TC-025: pre-existing codex behaviors pass through runStreamed path

**Category**: integration
**Priority**: must
**Source**: tasks.md > T-08

**GIVEN** the existing `tests/adapter/codex/agent-runner.test.ts` is migrated to use `runStreamed` mocks (via `makeStreamedTurn`)
**WHEN** the migrated test suite runs
**THEN** all pre-existing behaviors still pass: success path, usage mapping, RESULT_FILE_NOT_FOUND, timeout, base-branch propagation, enrichContext, session continuity, follow-up 2-turn execution, and typed-outcome via outputSchema

---

## Result

```yaml
result: completed
total: 26
automated: 25
manual: 1
must: 18
should: 8
could: 0
blocked_reasons: []
```
