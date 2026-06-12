# Spec: codex-adapter-parity

## Requirements

### Requirement: CodexAgentRunner SHALL auto-retry transient errors on the main work turn

When `transientRetry.maxRetries > 0`, `CodexAgentRunner.run()` SHALL retry the main work
turn on a transient error (SDK throw, `turn.failed`, or fatal `error` event whose message
matches the transient classifier), up to `maxRetries` additional attempts. Each retry
SHALL emit a `step:retry` event and increment the recorded `transientRetryAttempts`. The
retry SHALL stop early on success and SHALL halt with the existing error after the budget
is exhausted. The abort (timeout) signal SHALL suppress retries.

#### Scenario: transient error on the main turn retries then succeeds

**Given** a step whose main turn raises a transient error once, then succeeds
**And** `transientRetry.maxRetries = 3`
**When** `CodexAgentRunner.run()` executes the step
**Then** `completionReason` is `"success"`
**And** `transientRetryAttempts` is `1`
**And** exactly one `step:retry` event was emitted with `attempt = 1` and `maxRetries = 3`

#### Scenario: persistent transient error on the main turn halts after the budget

**Given** a step whose main turn always raises a transient error
**And** `transientRetry.maxRetries = 3`
**When** `CodexAgentRunner.run()` executes the step
**Then** the turn was attempted exactly `4` times (1 initial + 3 retries)
**And** `completionReason` is `"error"`
**And** `transientRetryAttempts` is `3`
**And** exactly three `step:retry` events were emitted with attempts `[1, 2, 3]`

### Requirement: CodexAgentRunner SHALL auto-retry transient errors on follow-up turns

`CodexAgentRunner.run()` SHALL apply the same transient-retry policy to its follow-up
turns — the typed-outcome (`outputSchema`) retry loop, the `postWorkPrompts` loop, and the
output-verification repair loop — so a transient error raised after the main turn succeeds
does not halt the step without retrying. Retries on follow-up turns SHALL emit `step:retry`
and accumulate into the same `transientRetryAttempts` total.

#### Scenario: transient error on a postWorkPrompts follow-up turn retries then succeeds

**Given** a step whose main turn succeeds and whose first `postWorkPrompts` turn raises a
transient error once, then succeeds
**And** `transientRetry.maxRetries = 3`
**When** `CodexAgentRunner.run()` executes the step
**Then** `completionReason` is `"success"`
**And** `transientRetryAttempts` is at least `1`
**And** at least one `step:retry` event was emitted

### Requirement: CodexAgentRunner SHALL NOT retry non-transient errors

When a turn raises an error that the transient classifier does not recognise,
`CodexAgentRunner.run()` SHALL fail immediately without any retry, emit no `step:retry`
event, and record `transientRetryAttempts = 0` (when the feature is enabled). When
`transientRetry.maxRetries = 0` the feature SHALL be fully disabled: no retry wrapper, no
`step:retry` events, and `transientRetryAttempts` SHALL be absent from the result.

#### Scenario: non-transient error fails on the first attempt

**Given** a step whose main turn raises a non-transient error
**And** `transientRetry.maxRetries = 3`
**When** `CodexAgentRunner.run()` executes the step
**Then** the turn was attempted exactly once
**And** `completionReason` is `"error"`
**And** no `step:retry` event was emitted
**And** `transientRetryAttempts` is `0`

#### Scenario: maxRetries = 0 disables the feature

**Given** a step whose main turn raises a transient error
**And** `transientRetry.maxRetries = 0`
**When** `CodexAgentRunner.run()` executes the step
**Then** the turn was attempted exactly once
**And** `completionReason` is `"error"`
**And** `transientRetryAttempts` is absent from the result

### Requirement: CodexAgentRunner SHALL write a JSONL verbose log only when logPath is set

When `ctx.session.logPath` is set, `CodexAgentRunner.run()` SHALL write the agent session
as JSONL to that path (one line per streamed event plus a final summary line carrying
session id, model, and token usage) using the shared `SessionLogWriter` (file mode 0600).
When `ctx.session.logPath` is unset, no session log file SHALL be created.

#### Scenario: logPath set produces a JSONL file

**Given** `ctx.session.logPath` points at a writable path
**When** `CodexAgentRunner.run()` executes a step that uses tools and finishes
**Then** the file exists and contains one or more JSON-parseable lines
**And** a summary line records the session id, model, and token usage

#### Scenario: logPath unset produces no file

**Given** `ctx.session.logPath` is undefined
**When** `CodexAgentRunner.run()` executes the step
**Then** no session log file is created

### Requirement: CodexAgentRunner SHALL emit step:progress as the agent uses tools

`CodexAgentRunner.run()` SHALL emit a `step:progress` event via `ctx.emit` when a
tool-bearing thread item starts (command execution, file change, MCP tool call, web
search), with payload `{ step, tool, target? }` matching the existing event contract.

#### Scenario: a command execution emits step:progress

**Given** a step whose turn starts a `command_execution` item
**When** `CodexAgentRunner.run()` consumes the event stream
**Then** a `step:progress` event is emitted with `step` equal to the step name and a
non-empty `tool` field

### Requirement: CodexAgentRunner SHALL run the output-verification repair loop

When `ctx.policy.outputVerification` is set and a session was established,
`CodexAgentRunner.run()` SHALL, after `postWorkPrompts`, repeatedly call `detect()`,
send a repair turn (without `outputSchema`) for remaining `follow-up`-policy violations,
and stop when there are no follow-up violations or `maxAttempts` is reached. A repair turn
failure SHALL be best-effort (it preserves the work-turn result rather than halting).

#### Scenario: a detected follow-up violation triggers a repair turn

**Given** `ctx.policy.outputVerification.detect()` returns one `follow-up` violation on the
first call and none on the second
**And** the main turn established a session
**When** `CodexAgentRunner.run()` reaches the output-verification stage
**Then** one additional repair turn is sent on the same thread
**And** `completionReason` remains `"success"`

### Requirement: Stale jsdoc SHALL describe local runtime runners, not ClaudeCodeRunner only

The jsdoc for `TransientRetryConfig` and `SpecRunnerConfig.transientRetry` in
`src/config/schema.ts`, and for `AgentRunResult.modelUsage` in
`src/core/port/agent-runner.ts`, SHALL state that the behaviour applies to local runtime
runners (ClaudeCodeRunner and CodexAgentRunner) rather than to ClaudeCodeRunner alone.

#### Scenario: jsdoc no longer claims ClaudeCodeRunner exclusivity

**Given** the updated source files
**When** a reader inspects the jsdoc for `transientRetry` and `modelUsage`
**Then** the text references local runtime runners including CodexAgentRunner
**And** it no longer states the behaviour is exclusive to ClaudeCodeRunner
