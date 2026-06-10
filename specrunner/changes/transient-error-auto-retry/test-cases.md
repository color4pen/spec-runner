# Test Cases: transient-error-auto-retry

## Summary

- **Total**: 25 cases
- **Automated** (unit/integration): 24
- **Manual**: 1
- **Priority**: must: 12, should: 9, could: 4

---

### TC-001: connection-refused error is transient

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transient agent errors SHALL be classified by a fail-closed whitelist > Scenario: connection-refused error is transient

---

### TC-002: failed-to-open-socket error is transient

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transient agent errors SHALL be classified by a fail-closed whitelist > Scenario: failed-to-open-socket error is transient

---

### TC-003: unknown error is not transient (fail-closed)

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: Transient agent errors SHALL be classified by a fail-closed whitelist > Scenario: unknown error is not transient (fail-closed)

---

### TC-004: one transient error then success completes the step

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Transient agent-step failures SHALL be retried a finite number of times with backoff > Scenario: one transient error then success completes the step

---

### TC-005: persistent transient error halts after the budget is exhausted

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Transient agent-step failures SHALL be retried a finite number of times with backoff > Scenario: persistent transient error halts after the budget is exhausted

---

### TC-006: non-transient error is not retried

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Transient agent-step failures SHALL be retried a finite number of times with backoff > Scenario: non-transient error is not retried

---

### TC-007: abort-triggered timeout bypasses retry

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The wall-clock step timeout SHALL NOT be retried > Scenario: abort-triggered timeout bypasses retry

---

### TC-008: exhausted transient retry escalates to awaiting-resume

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: Exhausting the budget SHALL fall through to the existing halt path unchanged > Scenario: exhausted transient retry escalates to awaiting-resume

---

### TC-009: attempt count recorded on success-after-retry

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Retry attempts SHALL be observable in state, journal, and progress output > Scenario: attempt count recorded on success-after-retry

---

### TC-010: attempt count recorded on halt-after-retry

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Retry attempts SHALL be observable in state, journal, and progress output > Scenario: attempt count recorded on halt-after-retry

---

### TC-011: progress output shows retrying

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: Retry attempts SHALL be observable in state, journal, and progress output > Scenario: progress output shows retrying

---

### TC-012: maxRetries 0 matches current behaviour exactly

**Category**: integration
**Priority**: must
**Source**: spec.md > Requirement: The retry budget SHALL be configurable, with 0 disabling the feature > Scenario: maxRetries 0 matches current behaviour exactly

---

### TC-013: default applies when config is absent

**Category**: unit
**Priority**: must
**Source**: spec.md > Requirement: The retry budget SHALL be configurable, with 0 disabling the feature > Scenario: default applies when config is absent

---

### TC-014: legacy state without the field loads cleanly

**Category**: integration
**Priority**: should
**Source**: spec.md > Requirement: The transientRetryAttempts field SHALL be backward compatible > Scenario: legacy state without the field loads cleanly

---

### TC-015: nested cause carries transient token

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria

**GIVEN** an error whose `cause` holds a transient message (e.g. `new Error("outer", { cause: new Error("ECONNREFUSED") })`)
**WHEN** `isTransientAgentError(err)` is evaluated
**THEN** it returns `true`

---

### TC-016: standalone 5xx numeric token does not false-match

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-01 Acceptance Criteria / design.md > D2

**GIVEN** an error message containing a bare numeric string (e.g. `"exit code 503"`) without an HTTP/status/API context token
**WHEN** `isTransientAgentError(err)` is evaluated
**THEN** it returns `false`

---

### TC-017: isTransientAgentError is a pure module

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-01

**GIVEN** the source of `src/adapter/claude-code/transient-error.ts`
**WHEN** its imports are inspected
**THEN** no I/O, SDK, or file-system imports are present (pure function, no side effects)

---

### TC-018: negative maxRetries is rejected by config schema

**Category**: unit
**Priority**: must
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a config object with `transientRetry: { maxRetries: -1 }`
**WHEN** the config is validated via the zod `configSchema`
**THEN** validation fails with a CONFIG_INVALID error

---

### TC-019: existing config without transientRetry section remains valid

**Category**: unit
**Priority**: should
**Source**: tasks.md > T-02 Acceptance Criteria

**GIVEN** a config object that has no `transientRetry` key
**WHEN** the config is validated and `resolveTransientRetryConfig` is called
**THEN** validation succeeds and `{ maxRetries: 3, baseDelayMs: 1000 }` is returned

---

### TC-020: all ClaudeCodeRunner return paths carry transientRetryAttempts

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-04 / design.md > D4

**GIVEN** a ClaudeCodeRunner configured to exit via each distinct path: success, error, timeout, redirect-limit exceeded, result-file-not-found
**WHEN** `run()` resolves for each path
**THEN** `AgentRunResult.transientRetryAttempts` is defined (value 0) on every path

---

### TC-021: _sleepFn injection eliminates real wait time in tests

**Category**: unit
**Priority**: could
**Source**: tasks.md > T-04 Acceptance Criteria / design.md > D6

**GIVEN** a `ClaudeCodeRunner` constructed with `_sleepFn: () => Promise.resolve()` and a mock `_queryFn` that always throws a transient error
**WHEN** `run()` is called with `maxRetries: 3`
**THEN** all 4 invocations complete synchronously (no real backoff delay elapsed)

---

### TC-022: transientRetryAttempts is absent from StepOutcome when no retry occurred

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-07 Acceptance Criteria

**GIVEN** a step that completes successfully on its first attempt with no transient errors
**WHEN** `pushStepResult` writes the outcome to state
**THEN** the `StepRun.outcome` object does not contain a `transientRetryAttempts` key

---

### TC-023: fold() restores transientRetryAttempts from events.jsonl

**Category**: integration
**Priority**: should
**Source**: tasks.md > T-08 Acceptance Criteria

**GIVEN** an `events.jsonl` journal line whose step attempt record has `transientRetryAttempts: 2` in its outcome
**WHEN** `fold()` processes the journal content
**THEN** the reconstructed `StepRun.outcome.transientRetryAttempts` equals 2

---

### TC-024: quiet mode suppresses step:retry progress output

**Category**: integration
**Priority**: could
**Source**: tasks.md > T-06 Acceptance Criteria

**GIVEN** a `ProgressReporter` running in quiet mode and a `step:retry` event is emitted on the EventBus
**WHEN** the event handler is invoked
**THEN** no retry line is written to stderr (consistent with quiet-mode suppression policy applied to other events)

---

### TC-025: design.md documents re-entry semantics

**Category**: manual
**Priority**: must
**Source**: request.md > 受け入れ基準 / design.md > D1 再入セマンティクス

**GIVEN** the design.md for transient-error-auto-retry
**WHEN** the document is reviewed
**THEN** it explicitly addresses: (1) new session started per retry (no session continuation across retries), (2) worktree residual artifacts may exist at retry start, and (3) per-step-class idempotency rationale (Implementer, Reviewer/Verifier, general principle)

---

## Result

```yaml
result: completed
total: 25
automated: 24
manual: 1
must: 12
should: 9
could: 4
blocked_reasons: []
```
