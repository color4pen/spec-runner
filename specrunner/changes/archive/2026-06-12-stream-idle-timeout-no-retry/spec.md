# Spec: stream-idle-timeout-no-retry

## Requirements

### Requirement: Follow-up query turns shall retry on transient errors

Follow-up query turns (postWorkPrompts, report_result retry loop) MUST apply the same
transient retry logic as the main work turn. Specifically, when a follow-up query turn
fails with a transient error — either as an SDK-level exception or as an error result
whose `errors[]` content matches a known transient token — it SHALL be retried using
the same `maxRetries` / `baseDelayMs` / exponential-backoff semantics already applied
to the main work turn.

#### Scenario: postWorkPrompts follow-up throws SDK transient exception

**Given** the main work turn succeeds and at least one `postWorkPrompts` follow-up turn runs
**When** the follow-up query throws an SDK exception whose message contains a transient token
  (e.g. "stream idle timeout")
**Then** the follow-up turn is retried up to `maxRetries` times with exponential backoff
  before the step halts

#### Scenario: postWorkPrompts follow-up returns transient error result

**Given** the main work turn succeeds and at least one `postWorkPrompts` follow-up turn runs
**When** the follow-up query returns an error result whose `errors[]` joined text contains
  a transient token
**Then** the follow-up turn is retried up to `maxRetries` times with exponential backoff
  before the step halts

#### Scenario: report_result follow-up throws SDK transient exception

**Given** `reportTool` is configured and the agent did not call it in the main work turn
**When** a report_result follow-up query throws an SDK exception whose message contains
  a transient token
**Then** the follow-up turn is retried up to `maxRetries` times with exponential backoff
  before the step halts

### Requirement: Retry events and counters shall be recorded for follow-up retries

When a follow-up query turn is retried due to a transient error, the runner MUST emit a
`step:retry` event and increment `transientRetryAttempts`, using the same event payload
schema as the main work turn.

#### Scenario: step:retry event emitted on follow-up transient retry

**Given** a follow-up query turn is being retried due to a transient error
**When** the retry fires
**Then** a `step:retry` event is emitted with `{ step, attempt, maxRetries, delayMs }`,
  and `transientRetryAttempts` in the final `AgentRunResult` reflects the total number
  of transient retries across all turns (main + follow-up)

### Requirement: Existing transient retry coverage shall not regress

All existing transient retry tests introduced in #600 and #626 MUST remain green without
modification.

#### Scenario: main work turn transient retry remains unchanged

**Given** the main work turn throws or returns a transient error
**When** the step runs with `maxRetries > 0`
**Then** behavior is identical to the pre-change implementation
