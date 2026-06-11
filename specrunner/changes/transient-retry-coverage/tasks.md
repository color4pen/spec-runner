# Tasks: transient-retry-coverage

## T-01: Add `"stream idle timeout"` to the transient token whitelist

File: `src/adapter/claude-code/transient-error.ts`

- [x] Insert `"stream idle timeout"` into `SIMPLE_TOKENS_LC` in the
  "Network / fetch errors" or "Socket errors" group (keep the array alphabetically
  sorted within its group).

**Acceptance Criteria**:
- `isTransientAgentError(new Error("Claude Code returned an error result: API Error: Stream idle timeout - partial response received"))` returns `true`
- `isTransientAgentError(new Error("API Error: Stream idle timeout"))` returns `true`
- All pre-existing tokens continue to return their previous values (existing tests pass)

---

## T-02: Add unit tests for the new token

File: `src/adapter/claude-code/__tests__/transient-error.test.ts`

- [x] Add a test case in the existing "Network / fetch errors" or "Socket errors"
  describe block for `"stream idle timeout"` matching.
- [x] Add a test case for the full SDK-wrapped form:
  `"Claude Code returned an error result: API Error: Stream idle timeout - partial response received"`.
- [x] Verify the substring is case-insensitive: `"Stream Idle Timeout"` also returns `true`.

**Acceptance Criteria**:
- Three new test assertions pass covering the token, the full wrapped message, and
  case-insensitivity.

---

## T-03: Convert transient error result to throw inside `runMainWorkTurn`

File: `src/adapter/claude-code/agent-runner.ts`

- [x] After the primary `runQuery()` call (and optional resume-fallback call) inside
  `runMainWorkTurn`, inspect the returned `lastResult`.
- [x] If `lastResult?.subtype !== "success"` (i.e. an error result was returned):
  - Extract `(lastResult as SDKResultMessage & { errors?: string[] }).errors ?? []`
  - Join the array into a single string: `errors.join(" ").trim()`
  - Call `isTransientAgentError(new Error(joinedText))`
  - If transient: throw `Object.assign(new Error(\`Claude Code SDK query failed: \${joinedText}\`), { code: "CLAUDE_CODE_QUERY_FAILED_TRANSIENT" })`
  - If non-transient (or `joinedText` is empty): return `{ lastResult }` unchanged
    so the existing outer handler at line 372 continues to own it.
- [x] The throw must originate from within `runMainWorkTurn` so that
  `retryWithBackoff` catches it via the existing `isTransientError` callback.

**Acceptance Criteria**:
- A query that returns `{ subtype: "error_during_execution", errors: ["Stream idle timeout"] }` results in a throw that `retryWithBackoff` classifies as transient.
- A query that returns `{ subtype: "error_during_execution", errors: ["something unexpected"] }` is returned unchanged; the outer handler emits `completionReason: "error"`.
- A query that returns `{ subtype: "error_during_execution" }` (no `errors` field) is returned unchanged.

---

## T-04: Add integration tests for the error result retry path

File: `src/adapter/claude-code/__tests__/agent-runner-transient-retry.test.ts`

- [x] **AC-ER1** (transient error result → success): queryFn yields
  `{ subtype: "error_during_execution", errors: ["Stream idle timeout"] }` on
  call 1, then yields a success result on call 2. Assert:
  - `completionReason === "success"`
  - `transientRetryAttempts === 1`
  - `step:retry` emitted once with `attempt: 1`
  - `queryFn` called exactly twice

- [x] **AC-ER2** (persistent transient error result → exhaustion): queryFn always
  yields `{ subtype: "error_during_execution", errors: ["Stream idle timeout"] }`.
  With `maxRetries: 3`. Assert:
  - `queryFn` called exactly 4 times
  - `completionReason === "error"`
  - `transientRetryAttempts === 3`
  - `step:retry` emitted 3 times

- [x] **AC-ER3** (non-transient error result → no retry): queryFn yields
  `{ subtype: "error_during_execution", errors: ["something unexpected"] }`. Assert:
  - `queryFn` called exactly once
  - no `step:retry` events
  - `completionReason === "error"` with `code: "CLAUDE_CODE_QUERY_FAILED"`

- [x] **AC-ER4** (empty errors array → no retry): queryFn yields
  `{ subtype: "error_during_execution" }` (no `errors` field). Assert:
  - `queryFn` called exactly once
  - `completionReason === "error"`

**Acceptance Criteria**:
- All four scenarios pass.
- No existing tests in the file are modified.

---

## T-05: Verify full test suite passes

- [x] Run `bun run typecheck` — zero type errors.
- [x] Run `bun run test` — all tests green including pre-existing tests in
  `agent-runner-transient-retry.test.ts`, `transient-error.test.ts`, and
  `agent-runner.test.ts`.

**Acceptance Criteria**:
- `typecheck` exits 0.
- `test` exits 0 with no failing cases.
