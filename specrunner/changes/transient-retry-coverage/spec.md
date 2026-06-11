# Spec: transient-retry-coverage

## Requirements

### Requirement: stream idle timeout is classified as transient

`isTransientAgentError` SHALL return `true` for any error whose message contains
the substring `"stream idle timeout"` (case-insensitive), including the exact
observed message `"API Error: Stream idle timeout - partial response received"`.

#### Scenario: stream idle timeout throw is retried

**Given** `maxRetries` is ≥ 1 and `abortController.signal.aborted` is false  
**When** the SDK query throws `new Error("Claude Code returned an error result: API Error: Stream idle timeout - partial response received")`  
**Then** `isTransientAgentError` returns `true`, `retryWithBackoff` fires a retry,
and `step:retry` is emitted with `attempt: 1`

#### Scenario: unrelated text is not affected

**Given** an error message that does not contain `"stream idle timeout"` or any
other whitelist token  
**When** `isTransientAgentError` is called  
**Then** it returns `false`

---

### Requirement: transient error result triggers retry

When `runQuery()` returns a `subtype !== "success"` result whose `errors[]` text is
classified as transient, `runMainWorkTurn` SHALL throw so that `retryWithBackoff`
can retry the full work turn.

#### Scenario: transient error result retried

**Given** `maxRetries` ≥ 1 and the query returns a result with
`subtype: "error_during_execution"` and `errors: ["Stream idle timeout"]`  
**When** `runner.run(ctx)` is called  
**Then** `step:retry` is emitted, `queryFn` is called a second time, and if the
second call succeeds `completionReason` is `"success"`

#### Scenario: non-transient error result halts immediately

**Given** `maxRetries` ≥ 1 and the query returns a result with
`subtype: "error_during_execution"` and `errors: ["something unexpected"]`  
**When** `runner.run(ctx)` is called  
**Then** `queryFn` is called exactly once, no `step:retry` event is emitted, and
`completionReason` is `"error"` with `code: "CLAUDE_CODE_QUERY_FAILED"`

#### Scenario: error result with empty errors array halts immediately

**Given** `maxRetries` ≥ 1 and the query returns a result with
`subtype: "error_during_execution"` and no `errors` field  
**When** `runner.run(ctx)` is called  
**Then** `queryFn` is called exactly once and `completionReason` is `"error"`

---

### Requirement: retry exhaustion halts as before

When all retry attempts are consumed via error result conversion, `runner.run`
SHALL return `completionReason: "error"` and the halt → escalation path is
unchanged.

#### Scenario: persistent transient error result exhausts budget

**Given** `maxRetries: 3` and every query call returns a transient error result  
**When** `runner.run(ctx)` is called  
**Then** `queryFn` is called exactly 4 times (1 initial + 3 retries),
`completionReason` is `"error"`, and `transientRetryAttempts` is `3`

---

### Requirement: existing throw-path behaviour is unchanged

The throw-based transient retry path (errors thrown by the SDK query function)
MUST continue to work exactly as before; no existing test cases may regress.
