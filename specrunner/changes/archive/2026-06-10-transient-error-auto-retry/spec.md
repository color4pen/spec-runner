# Spec: transient-error-auto-retry

## Requirements

### Requirement: Transient agent errors SHALL be classified by a fail-closed whitelist

The local Claude Code adapter SHALL classify an agent error as *transient* only when its
message (including nested `cause`) matches a defined whitelist of connection / socket /
network-timeout / 5xx-class tokens. Any error not matching the whitelist — including unknown
error strings — MUST be treated as non-transient.

#### Scenario: connection-refused error is transient

**Given** an error with message `Claude Code SDK query failed: API Error: Unable to connect to API (ConnectionRefused)`
**When** `isTransientAgentError(err)` is evaluated
**Then** it returns `true`

#### Scenario: failed-to-open-socket error is transient

**Given** an error with message containing `(FailedToOpenSocket)`
**When** `isTransientAgentError(err)` is evaluated
**Then** it returns `true`

#### Scenario: unknown error is not transient (fail-closed)

**Given** an error with an arbitrary message not on the whitelist (e.g. `something unexpected happened`)
**When** `isTransientAgentError(err)` is evaluated
**Then** it returns `false`

### Requirement: Transient agent-step failures SHALL be retried a finite number of times with backoff

When the main work turn of a local agent step throws a transient error, the adapter SHALL
retry it up to `transientRetry.maxRetries` times with exponential backoff before surfacing a
failure. Retrying MUST NOT exceed the configured budget (no unbounded retry).

#### Scenario: one transient error then success completes the step

**Given** `transientRetry.maxRetries` is 3
**And** the SDK query throws a transient error on its first invocation and succeeds on the second
**When** the agent step runs
**Then** the step completes with `completionReason: "success"` without halting the pipeline
**And** `transientRetryAttempts` is recorded as 1

#### Scenario: persistent transient error halts after the budget is exhausted

**Given** `transientRetry.maxRetries` is 3
**And** the SDK query throws a transient error on every invocation
**When** the agent step runs
**Then** the SDK query is invoked exactly 4 times (1 initial + 3 retries) and no more
**And** the adapter returns `completionReason: "error"` with code `CLAUDE_CODE_QUERY_FAILED`
**And** the pipeline reaches `awaiting-resume` (halt), proving the loop is bounded

#### Scenario: non-transient error is not retried

**Given** `transientRetry.maxRetries` is 3
**And** the SDK query throws a non-transient (unknown) error
**When** the agent step runs
**Then** the SDK query is invoked exactly once
**And** the adapter returns `completionReason: "error"` immediately (no retry, no backoff)

### Requirement: The wall-clock step timeout SHALL NOT be retried

A step timeout signalled via `abortController` (wall-clock budget) MUST be excluded from
transient retry. It SHALL continue to surface as `completionReason: "timeout"`.

#### Scenario: abort-triggered timeout bypasses retry

**Given** the step's wall-clock timeout fires and aborts the query
**When** the resulting error is evaluated for retry
**Then** it is not retried (the abort guard short-circuits classification)
**And** the adapter returns `completionReason: "timeout"`

### Requirement: Exhausting the budget SHALL fall through to the existing halt path unchanged

When the retry budget is exhausted, the pipeline SHALL halt exactly as it does today:
the step records a failed `StepRun`, the pipeline escalates, and the job transitions to
`awaiting-resume` with a `resumePoint`. The escalation semantics, transition table, and error
codes MUST NOT change.

#### Scenario: exhausted transient retry escalates to awaiting-resume

**Given** the transient retry budget is exhausted for an agent step
**When** the pipeline processes the resulting `completionReason: "error"`
**Then** the job status becomes `awaiting-resume`
**And** a `resumePoint` for that step is recorded

### Requirement: Retry attempts SHALL be observable in state, journal, and progress output

The number of transient retry attempts SHALL be recorded as `transientRetryAttempts` in the
step's `StepRun.outcome` (state.json) and in the corresponding `events.jsonl` step-attempt
record. While retrying, the adapter SHALL emit progress output indicating a retry is in
progress. A halt that followed N retries MUST be distinguishable from an immediate halt.

#### Scenario: attempt count recorded on success-after-retry

**Given** an agent step succeeds after 1 transient retry
**When** the step result is persisted
**Then** `StepRun.outcome.transientRetryAttempts` is 1 in both state.json and events.jsonl

#### Scenario: attempt count recorded on halt-after-retry

**Given** an agent step halts after exhausting 3 transient retries
**When** the failed step result is persisted
**Then** `StepRun.outcome.transientRetryAttempts` is 3, distinguishing it from an immediate halt (0)

#### Scenario: progress output shows retrying

**Given** an agent step encounters a transient error and retries
**When** the retry is initiated
**Then** a `step:retry` event is emitted and the progress reporter writes a retry line to stderr

### Requirement: The retry budget SHALL be configurable, with 0 disabling the feature

The maximum retry count SHALL be read from `transientRetry.maxRetries` (default 3). A value of
0 SHALL disable transient retry entirely, producing behaviour identical to the pre-feature halt
path (no retry wrapper, no `step:retry` events, no `transientRetryAttempts` recorded).

#### Scenario: maxRetries 0 matches current behaviour exactly

**Given** `transientRetry.maxRetries` is 0
**And** the SDK query throws a transient error
**When** the agent step runs
**Then** the SDK query is invoked exactly once and the adapter returns `completionReason: "error"`
**And** no `step:retry` event is emitted and `transientRetryAttempts` is not recorded

#### Scenario: default applies when config is absent

**Given** a config without a `transientRetry` section
**When** `resolveTransientRetryConfig(config)` is evaluated
**Then** `maxRetries` resolves to 3 and `baseDelayMs` resolves to 1000

### Requirement: The transientRetryAttempts field SHALL be backward compatible

The `transientRetryAttempts` field SHALL be optional at every layer (port result, StepOutcome,
StepResultInput, StepAttemptRecord). Existing state.json and events.jsonl files that lack the
field MUST load without error and MUST NOT require schema migration.

#### Scenario: legacy state without the field loads cleanly

**Given** a state.json whose step outcomes have no `transientRetryAttempts` field
**When** the state is validated and normalized
**Then** validation succeeds and the field is treated as absent (undefined)
