# Spec: AgentRunner Contract Tests

## Requirements

### Requirement: resumePrompt is included in the main-turn prompt

When `ctx.session.resumePrompt` is set, every local adapter SHALL inject its value into the main-turn prompt wrapped in `<resume-context>` tags, before the prompt is sent to the underlying SDK.

#### Scenario: claude-code adapter injects resumePrompt

**Given** a `ClaudeCodeRunner` configured with a capturing mock `_queryFn`
**When** `ctx.session.resumePrompt = "extra context"` and `runner.run(ctx)` is called
**Then** the first prompt argument captured by the mock contains `<resume-context>` and the text "extra context"

#### Scenario: codex adapter injects resumePrompt

**Given** a `CodexAgentRunner` configured with a capturing mock `CodexThread`
**When** `ctx.session.resumePrompt = "extra context"` and `runner.run(ctx)` is called
**Then** the first prompt argument captured by `thread.runStreamed` contains `<resume-context>` and the text "extra context"

---

### Requirement: reportTool result is collected and returned

When `ctx.policy.reportTool` is set and the agent responds with a valid report, every local adapter SHALL set `result.toolResult` to a non-null value with `ok: true`.

#### Scenario: claude-code adapter captures toolResult via MCP handler

**Given** a `ClaudeCodeRunner` with a mock `_createMcpServerFn` that exposes the tool handler, and a mock `_queryFn` that calls the handler with `{ok: true}` before yielding a success result
**When** `ctx.policy.reportTool` is set to `REPORT_TOOL` and `runner.run(ctx)` is called
**Then** `result.toolResult !== null` and `result.toolResult.ok === true`

#### Scenario: codex adapter extracts toolResult from finalResponse JSON

**Given** a `CodexAgentRunner` with a mock `CodexThread` whose `runStreamed` returns an `agent_message` item with text `{"ok":true}`
**When** `ctx.policy.reportTool` is set to `REPORT_TOOL` and `runner.run(ctx)` is called
**Then** `result.toolResult !== null` and `result.toolResult.ok === true`

---

### Requirement: transient errors trigger retry and emit step:retry

When the underlying SDK throws an error matching a known transient pattern (e.g. "ECONNREFUSED") and `config.transientRetry.maxRetries >= 1`, every local adapter SHALL retry the failed call, emit at least one `step:retry` event, and return `result.transientRetryAttempts >= 1` on eventual success.

#### Scenario: claude-code adapter retries on transient SDK throw

**Given** a `ClaudeCodeRunner` with a mock `_queryFn` that throws `new Error("ECONNREFUSED")` on the first call and succeeds on the second, `config.transientRetry.maxRetries = 1`, and a no-op `sleepFn`
**When** `runner.run(ctx)` is called
**Then** `result.completionReason === "success"`, `result.transientRetryAttempts >= 1`, and at least one `step:retry` event is emitted via `ctx.emit`

#### Scenario: codex adapter retries on transient SDK throw

**Given** a `CodexAgentRunner` with a mock `CodexThread` whose `runStreamed` throws `new Error("ECONNREFUSED")` on the first call and succeeds on the second, `config.transientRetry.maxRetries = 1`, and a no-op `_sleepFn`
**When** `runner.run(ctx)` is called
**Then** `result.completionReason === "success"`, `result.transientRetryAttempts >= 1`, and at least one `step:retry` event is emitted via `ctx.emit`

---

### Requirement: logPath causes JSONL output to be written

When `ctx.session.logPath` is set, every local adapter SHALL create a file at that path and write at least one JSONL line during the run.

#### Scenario: claude-code adapter writes to logPath

**Given** a `ClaudeCodeRunner` and `ctx.session.logPath` pointing to a path in a temp directory
**When** `runner.run(ctx)` completes
**Then** the file at `logPath` exists and contains at least one line that parses as JSON

#### Scenario: codex adapter writes to logPath

**Given** a `CodexAgentRunner` and `ctx.session.logPath` pointing to a path in a temp directory
**When** `runner.run(ctx)` completes
**Then** the file at `logPath` exists and contains at least one line that parses as JSON

---

### Requirement: postWorkPrompts causes additional SDK invocations

When `ctx.policy.postWorkPrompts` contains N prompts and the main work turn succeeds, every local adapter SHALL invoke the underlying SDK at least `1 + N` times (once for the main turn, once per follow-up prompt).

#### Scenario: claude-code adapter executes postWorkPrompts

**Given** a `ClaudeCodeRunner` with a counting mock `_queryFn` and `ctx.policy.postWorkPrompts = ["cleanup please"]`
**When** `runner.run(ctx)` completes successfully
**Then** the mock `_queryFn` was invoked at least 2 times

#### Scenario: codex adapter executes postWorkPrompts

**Given** a `CodexAgentRunner` with a counting mock `CodexThread` and `ctx.policy.postWorkPrompts = ["cleanup please"]`
**When** `runner.run(ctx)` completes successfully
**Then** mock `thread.runStreamed` was invoked at least 2 times

---

### Requirement: all local adapters are registered in the contract suite

The contract test file SHALL enumerate adapter directories in `src/adapter/` that contain `agent-runner.ts` and are local (excluding `managed-agent`, `github`, `shared`, `dispatching`). Every such directory SHALL be present as a key in `REGISTERED_LOCAL_RUNNERS`. Any unregistered local adapter SHALL cause the completeness test to fail.

#### Scenario: completeness gate fires on unregistered local adapter

**Given** `src/adapter/` contains `claude-code/agent-runner.ts` and `codex/agent-runner.ts`
**When** the completeness test runs
**Then** both `"claude-code"` and `"codex"` are keys in `REGISTERED_LOCAL_RUNNERS` and no unregistered local adapter directory exists

---

### Requirement: managed-agent adapter is permanently excluded

The `ManagedAgentRunner` adapter SHALL NOT be included in `REGISTERED_LOCAL_RUNNERS`. It is excluded because it requires a live Managed Agents API, has no `logPath` behavior (no local JSONL file I/O), does not use `config.transientRetry`, and does not execute `postWorkPrompts` as a sequence of same-session turns.
