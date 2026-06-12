# Tasks: stream-idle-timeout-no-retry

## T-01: RCA — confirm follow-up turn as the failing path

- [ ] Open `.specrunner/logs/e9602244-4d28-46da-8cc8-d8a109881172.log` (on the machine
      where the job ran) and confirm the presence of `step:start` and `step:error` for
      the `code-review` step with **no** `step:retry` event between them.
- [ ] Confirm the error message matches
      `Claude Code SDK query failed: Claude Code returned an error result: API Error: Stream idle timeout - partial response received`
      (single `Claude Code SDK query failed:` prefix — characteristic of the outer catch,
      not of `maybeThrowTransientResult`).
- [ ] Add a comment in the test file for T-02 referencing the log job ID as evidence.

**Acceptance Criteria**:
- The log analysis is captured as a comment in the test file so future readers can
  trace the evidence.

---

## T-02: Extract `runFollowUpQueryWithRetry` helper in `agent-runner.ts`

File: `src/adapter/claude-code/agent-runner.ts`

- [ ] Inside `ClaudeCodeRunner.run()`, immediately after `runMainWorkTurn` is defined
      (around line 320), define a new `async` helper:

  ```typescript
  const runFollowUpQueryWithRetry = async (
    prompt: string,
    options: Record<string, unknown>,
    onMessage: (msg: SDKMessage) => void = () => {},
  ): Promise<SDKResultMessage | null> => { ... }
  ```

- [ ] Inside the helper, implement the following logic wrapped in `retryWithBackoff`:
  1. Call `this.queryFn({ prompt, options })` and iterate the async generator.
  2. Call `onMessage(message)` for every yielded item.
  3. Collect the last `message.type === "result"` item as `lastResult`.
  4. After the loop, if `lastResult` exists and `lastResult.subtype !== "success"`:
     - Join `(lastResult as any).errors ?? []` → `joinedText`
     - If `joinedText` is non-empty and `isTransientAgentError(new Error(joinedText))`
       is true, throw `Object.assign(new Error(\`Claude Code SDK query failed: ${joinedText}\`), { code: "CLAUDE_CODE_QUERY_FAILED_TRANSIENT" })`
  5. Return `lastResult` (may be success, non-transient error, or null).
  6. Wrap the whole function body in `retryWithBackoff` with:
     - `maxAttempts: maxRetries + 1`
     - `baseDelayMs`
     - `isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err)`
     - `sleepFn: this.sleepFn`
     - `onRetry: (attempt) => { transientRetryAttempts++; ctx.emit("step:retry", { step: step.name, attempt, maxRetries, delayMs: baseDelayMs * Math.pow(2, attempt - 1) }); }`

- [ ] Change the main-work-turn `onRetry` callback from `transientRetryAttempts = attempt`
      to `transientRetryAttempts++` (D2).

**Acceptance Criteria**:
- `runFollowUpQueryWithRetry` exists as a closure inside `run()`.
- The helper compiles cleanly under `bun run typecheck`.

---

## T-03: Apply the helper to postWorkPrompts follow-up turns

File: `src/adapter/claude-code/agent-runner.ts`

- [ ] Locate the `postWorkPrompts` loop (the `for (const followPrompt of ctx.policy.postWorkPrompts!)` block).
- [ ] Replace the bare `this.queryFn(...)` call + `for await` iteration + `followLastResult`
      collection with a single `await runFollowUpQueryWithRetry(followPrompt, followUpOptions, onMessage)` call, where `onMessage` emits `step:progress` (call `emitToolProgress` as the current loop already does).
- [ ] Assign the return value to `followLastResult` directly.
- [ ] Keep the existing non-success check and early `return { completionReason: "error", ... }` block unchanged — the helper only adds retry before returning a non-success result.

**Acceptance Criteria**:
- A transient SDK exception thrown during a postWorkPrompts query is retried before halting.
- A transient error result from a postWorkPrompts query is retried before halting.
- A non-transient error result still causes an early `completionReason: "error"` return.

---

## T-04: Apply the helper to the report_result follow-up retry loop

File: `src/adapter/claude-code/agent-runner.ts`

- [ ] Locate the `report_result follow-up retry` loop (the `for (let attempt = 1; attempt <= retryPolicy.maxAttempts; attempt++)` block after the main work turn).
- [ ] Replace the bare `this.queryFn(...)` call + `for await` iteration inside this loop
      with `await runFollowUpQueryWithRetry(retryPrompt, retryOptions)`.
  - The loop is already iterating for "no tool call" retries; transient retries are now
    handled inside the helper automatically.
  - No message handler is needed (the current loop already ignores messages except for
    `result`, and tool capture happens via the MCP closure).
- [ ] Remove the manual `for await` loop that was replaced.

**Acceptance Criteria**:
- A transient SDK exception thrown during a report_result follow-up query is retried
  (up to `maxRetries` times) before allowing the exception to propagate.

---

## T-05: Write tests — postWorkPrompts transient error triggers retry

File: `tests/unit/adapter/claude-code/agent-runner.test.ts`

- [ ] Add a test group:
  `describe("postWorkPrompts follow-up — transient SDK exception triggers retry")`

  - Scenario A — **transient SDK exception**:
    - `queryFn`: first call (main work) → success; second call (follow-up) → throws
      `new Error("stream idle timeout")` on first invocation, then succeeds on retry.
    - Config: `transientRetry.maxRetries = 1`, `_sleepFn = async () => {}`.
    - Assert: `result.completionReason === "success"` (or at least not a halt due to
      unretried transient), `result.transientRetryAttempts >= 1`, at least one
      `step:retry` event was emitted.

  - Scenario B — **transient error result**:
    - `queryFn`: first call → success; second call → yields an error result message
      with `errors: ["API Error: Stream idle timeout"]` on first invocation, then
      succeeds on retry.
    - Same assertions as Scenario A.

  - Scenario C — **non-transient error result is not retried**:
    - `queryFn`: first call → success; second call → yields a non-transient error result.
    - Assert: `result.completionReason === "error"`, `result.transientRetryAttempts === 0`
      (no spurious retries).

**Acceptance Criteria**:
- All three scenarios pass.
- `step:retry` event is emitted in scenarios A and B with correct payload fields.
- `transientRetryAttempts` is present and ≥ 1 in scenarios A and B.

---

## T-06: Write tests — report_result follow-up transient SDK exception triggers retry

File: `tests/unit/adapter/claude-code/agent-runner.test.ts`

- [ ] Add a test group:
  `describe("report_result follow-up — transient SDK exception triggers retry")`

  - `reportTool` configured, `queryFn`:
    - Main work turn → success, does NOT call report tool.
    - First follow-up attempt → throws `new Error("stream idle timeout")`.
    - Second follow-up attempt (after retry) → success, calls report tool (captured via MCP closure).
  - Config: `transientRetry.maxRetries = 1`, `_sleepFn = async () => {}`.
  - Assert: `result.completionReason === "success"`, at least one `step:retry` event,
    `result.transientRetryAttempts >= 1`.

**Acceptance Criteria**:
- Test passes.
- `step:retry` event emitted with correct `step`, `attempt`, `maxRetries`, `delayMs`.

---

## T-07: Verify existing transient retry tests remain green

- [ ] Run `bun run typecheck && bun run test`.
- [ ] Confirm all pre-existing tests (including tests from #600 and #626) pass without
      modification.
- [ ] Confirm the two new test groups (T-05, T-06) pass.

**Acceptance Criteria**:
- `typecheck` exits 0.
- `test` exits 0 with no skipped or failed tests.
