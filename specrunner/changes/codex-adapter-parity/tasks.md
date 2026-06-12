# Tasks: codex-adapter-parity

Implements the design in `design.md`. Order matters: T-01/T-02 (shared extractions) unblock
the codex changes; T-03–T-06 build the codex behaviour; T-07 updates jsdoc; T-08–T-09 are
tests and the green gate.

---

## T-01: Extract `isTransientAgentError` to `src/adapter/shared/transient-error.ts` (D5)

- [ ] Move the full contents of `src/adapter/claude-code/transient-error.ts` (the
      `SIMPLE_TOKENS_LC` / `STATUS_5XX_PATTERN` tables, `collectMessages`,
      `isTransientMessage`, `isTransientAgentError`) into a new file
      `src/adapter/shared/transient-error.ts`. Keep behaviour byte-for-byte identical.
- [ ] Export the token table so a future codex-specific token can be added with evidence,
      e.g. `export const TRANSIENT_TOKENS: readonly string[] = SIMPLE_TOKENS_LC;`
      (do NOT add any new tokens in this request — fail-closed; no invented Codex strings).
- [ ] Replace `src/adapter/claude-code/transient-error.ts` with a re-export shim:
      `export { isTransientAgentError } from "../shared/transient-error.js";`
      (and re-export `TRANSIENT_TOKENS` if any consumer needs it).
- [ ] Do NOT edit `src/adapter/claude-code/agent-runner.ts` or
      `src/adapter/claude-code/__tests__/transient-error.test.ts` — their import paths must
      keep resolving through the shim.

**Acceptance Criteria**:
- `src/adapter/shared/transient-error.ts` exports `isTransientAgentError` with unchanged
  classification behaviour.
- The claude-code shim re-exports it; existing claude-code imports compile unchanged.
- `bun run typecheck` passes.

---

## T-02: Extract `SessionLogWriter` to `src/adapter/shared/session-log-writer.ts` (D3)

- [ ] Move the full `SessionLogWriter` class from
      `src/adapter/claude-code/session-log-writer.ts` into a new file
      `src/adapter/shared/session-log-writer.ts`. Update the internal `ModelUsage` import to
      the correct relative path (`../../core/port/agent-runner.js` from `shared/`).
- [ ] Replace `src/adapter/claude-code/session-log-writer.ts` with a re-export shim:
      `export { SessionLogWriter } from "../shared/session-log-writer.js";`
- [ ] Do NOT edit `src/adapter/claude-code/agent-runner.ts` or
      `src/adapter/claude-code/__tests__/session-log-writer.test.ts` — they keep importing
      from their current paths via the shim.

**Acceptance Criteria**:
- `src/adapter/shared/session-log-writer.ts` exports `SessionLogWriter` (mode 0600,
  masked JSONL, `writeSummary`, idempotent `close`) unchanged.
- Existing claude-code session-log-writer test passes without modification.
- `bun run typecheck` passes.

---

## T-03: Add streaming `executeTurn` + observability seams to CodexAgentRunner (D1, D3, D4)

File: `src/adapter/codex/agent-runner.ts`

- [ ] Extend the injectable `CodexThread` interface to add
      `runStreamed(prompt: string, opts?: { signal?: AbortSignal; outputSchema?: unknown }):
      Promise<{ events: AsyncGenerator<CodexThreadEvent> }>` and remove the runner's reliance
      on `run`. Define minimal local `CodexThreadEvent` / `ThreadItem` interfaces (mirroring
      the SDK's `item.started` / `item.updated` / `item.completed` / `turn.completed` /
      `turn.failed` / `error` shapes) to avoid a deep SDK type dependency — same minimalism
      as the existing `Turn` / `CodexUsage` interfaces.
- [ ] Add a constructor dep `_sleepFn?: (ms: number) => Promise<void>` (default
      `setTimeout`-based), mirroring `ClaudeCodeRunnerDeps._sleepFn`, for deterministic
      retry tests.
- [ ] Add a pure module helper
      `extractCodexProgress(item): { tool: string; target?: string } | null` per D4:
      `command_execution → { "Bash", <command truncated ~40> }`,
      `file_change → { "Edit", <first changed path> }`,
      `mcp_tool_call → { <tool>, <server> }`,
      `web_search → { "WebSearch", <query> }`, else `null`.
- [ ] Add a private async helper `executeTurn(thread, prompt, opts, logWriter)` that:
  - calls `thread.runStreamed(prompt, opts)` and iterates `events`;
  - for `item.started`: `const p = extractCodexProgress(ev.item); if (p) ctx.emit(
    "step:progress", { step: step.name, tool: p.tool, ...(p.target ? { target: p.target } :
    {}) });`
  - for **every** event, when `logWriter` is non-null, `logWriter.write({ type: ev.type,
    item: ev.item, usage: ev.usage })` (omit undefined fields);
  - for `item.completed`: push `ev.item` into a local `items[]`; if `ev.item.type ===
    "agent_message"` set `finalResponse = ev.item.text`;
  - for `turn.completed`: set `usage` from `ev.usage` (map to the existing `CodexUsage`
    shape: `input_tokens`, `output_tokens`, `cached_input_tokens`);
  - for `turn.failed` (use `ev.error.message`) or a fatal `error` event (use `ev.message`):
    `throw new Error(message)` so transient classification + resume fallback handle it;
  - returns `{ items, finalResponse, usage } as Turn`.
- [ ] Open `const sessionLogWriter = ctx.session.logPath ? new SessionLogWriter(
      ctx.session.logPath) : null;` (import from `../shared/session-log-writer.js`). Call
      `sessionLogWriter?.writeSummary({ sessionId: threadId ?? undefined, model:
      resolvedConfig.model, modelUsage })` then `sessionLogWriter?.close()` on **every**
      return path (success, RESULT_FILE_NOT_FOUND, timeout, error catch).
- [ ] Replace the existing 4 `activeThread.run(...)` / `freshThread.run(...)` call sites
      (main turn, resume-fallback turn, typed-outcome retry turn, postWorkPrompts turn) with
      `executeTurn(...)` calls. Preserve the existing usage-accumulation arithmetic — it now
      reads `turn.usage` from the reconstructed `Turn`.

**Acceptance Criteria**:
- `CodexThread` exposes `runStreamed`; the runner no longer calls `thread.run`.
- `step:progress` is emitted on tool-item start; the payload shape is
  `{ step, tool, target? }`.
- A `SessionLogWriter` is opened only when `ctx.session.logPath` is set and is closed on
  every exit path.
- `bun run typecheck` passes.

---

## T-04: Add transient-retry topology to CodexAgentRunner (D2)

File: `src/adapter/codex/agent-runner.ts`

- [ ] Import `retryWithBackoff` from `../../util/retry.js` and `isTransientAgentError` from
      `../shared/transient-error.js`. Import `resolveTransientRetryConfig` from
      `../../config/schema.js`.
- [ ] Resolve `const { maxRetries, baseDelayMs } = resolveTransientRetryConfig(ctx.config);`
      and declare `let transientRetryAttempts = 0;` and `let resumeFallbackDone = false;`.
- [ ] Restructure the main-turn block into a `runMainWorkTurn()` unit that performs the
      `startThread` / `resumeThread` selection and the existing resume→fresh-thread fallback,
      returning the `executeTurn(...)` result. The resume fallback fires only on the first
      failure when `ctx.session.resumeSessionId` was used and `!resumeFallbackDone` and
      `!abortController.signal.aborted` (set `resumeFallbackDone = true`). Mirror
      `ClaudeCodeRunner.runMainWorkTurn` (`agent-runner.ts:324-351`).
- [ ] Invoke the main turn as:
  ```ts
  let turn: Turn;
  if (maxRetries === 0) {
    turn = await runMainWorkTurn();
  } else {
    turn = await retryWithBackoff(runMainWorkTurn, {
      maxAttempts: maxRetries + 1,
      baseDelayMs,
      isTransientError: (err) => !abortController.signal.aborted && isTransientAgentError(err),
      sleepFn: this.sleepFn,
      onRetry: (attempt) => {
        transientRetryAttempts++;
        ctx.emit("step:retry", { step: step.name, attempt, maxRetries,
          delayMs: baseDelayMs * Math.pow(2, attempt - 1) });
      },
    });
  }
  ```
- [ ] Add `runFollowUpTurnWithRetry(thread, prompt, opts)` that wraps `executeTurn` in
      `retryWithBackoff` with the **same** options and the same incrementing `onRetry`.
      Route the typed-outcome retry loop, the `postWorkPrompts` loop, and the
      output-verification repair turn (T-06) through it.
- [ ] Include `transientRetryAttempts` on every returned `AgentRunResult` **only when
      `maxRetries > 0`**: `...(maxRetries > 0 ? { transientRetryAttempts } : {})` on the
      success result, the RESULT_FILE_NOT_FOUND result, the timeout result, and the error
      catch result. Leave it absent when `maxRetries === 0`.
- [ ] Keep the timeout (`STEP_TIMEOUT`) and non-transient error (`CODEX_SDK_ERROR`) catch
      branches; a non-transient throw reaches the outer catch unchanged after no retries.

**Acceptance Criteria**:
- Main turn and all follow-up turns retry on transient errors with shared
  `maxRetries`/`baseDelayMs`, emit `step:retry`, and accumulate `transientRetryAttempts`.
- Non-transient errors are not retried; abort/timeout suppresses retries.
- `transientRetryAttempts` is present iff `maxRetries > 0`.
- `bun run typecheck` passes.

---

## T-05: Confirm typed-outcome retry turns still inject `outputSchema` through the new path

File: `src/adapter/codex/agent-runner.ts`

- [ ] Verify the main work turn and the typed-outcome retry turns still pass
      `{ signal, outputSchema }` to `executeTurn` → `runStreamed` (TurnOptions are identical
      between `run` and `runStreamed`).
- [ ] Verify `postWorkPrompts` turns and output-verification repair turns are still invoked
      **without** `outputSchema` (tool detection is main-work-turn only).
- [ ] Verify `tryParseToolResult` still reads `turn.finalResponse` (now reconstructed from
      the final `agent_message` item).

**Acceptance Criteria**:
- Main/retry turns receive `outputSchema`; postWork/repair turns do not.
- Typed-outcome parsing (`toolResult` / `followUpAttempts`) behaves as before.

---

## T-06: Add the output-verification repair loop to CodexAgentRunner (D6)

File: `src/adapter/codex/agent-runner.ts`

- [ ] After the `postWorkPrompts` block, add the repair loop, mirroring
      `ClaudeCodeRunner` (`agent-runner.ts:572-621`): run only when
      `ctx.policy?.outputVerification` is set and a session was established
      (`threadId` truthy). For `attempt` in `1..maxAttempts`:
  - `try { checkResult = await outputVerif.detect(); } catch { break; }`
  - keep `violations.filter(v => v.policy === "follow-up")`; if empty `break`;
  - `const repairPrompt = outputVerif.buildPrompt(followUpViolations, attempt);`
  - run a repair turn on the active thread via `runFollowUpTurnWithRetry(activeThread,
    repairPrompt, { signal })` (no `outputSchema`), inside a `try/catch` that warns and
    continues on failure (best-effort); accumulate usage into `modelUsage`/`turn`;
  - `followUpAttempts++;`
- [ ] Ensure the accumulated `modelUsage` is what gets written to the session-log summary
      and returned.

**Acceptance Criteria**:
- A `follow-up` violation triggers one repair turn on the same thread; clearing the
  violation stops the loop; `maxAttempts` bounds it.
- A repair-turn failure is best-effort and preserves the work-turn result.
- `bun run typecheck` passes.

---

## T-07: Refresh stale jsdoc (D7)

- [ ] `src/config/schema.ts` — in `TransientRetryConfig` (~line 300) and
      `SpecRunnerConfig.transientRetry` (~line 401), change "Applied to the local
      ClaudeCodeRunner only; ignored by managed runtime." →
      "Applied to local runtime runners (ClaudeCodeRunner and CodexAgentRunner); ignored by
      the managed runtime."
- [ ] `src/core/port/agent-runner.ts` (~line 186) — change the `modelUsage` jsdoc "Only
      populated by ClaudeCodeRunner (SDK provides this); ManagedAgentRunner leaves it
      undefined." → "Populated by local runtime runners (ClaudeCodeRunner, CodexAgentRunner);
      ManagedAgentRunner leaves it undefined."
- [ ] Comments only — no behaviour change.

**Acceptance Criteria**:
- The three jsdoc sites reference CodexAgentRunner; none claims ClaudeCodeRunner
  exclusivity.

---

## T-08: Migrate existing codex tests from `run` to `runStreamed` (D1 cost)

File: `tests/adapter/codex/agent-runner.test.ts`

- [ ] Add a helper `makeStreamedTurn({ finalResponse, items, usage })` that returns
      `{ events }` where `events` is an async generator yielding, in order: one
      `{ type: "item.completed", item }` per `items` entry, one
      `{ type: "item.completed", item: { type: "agent_message", text: finalResponse } }`,
      and one `{ type: "turn.completed", usage } }` (omit when `usage` is null).
- [ ] Update `makeThread` / inline thread mocks to expose `runStreamed: vi.fn()...` instead
      of `run`, returning `makeStreamedTurn(...)`. For multi-turn tests, drive distinct
      per-call return values exactly as the current `run` mocks do.
- [ ] Translate every assertion on `thread.run` / `mockRun` to `thread.runStreamed`. The
      opts argument (`{ signal, outputSchema }`) is asserted identically (now the 2nd arg of
      `runStreamed`). Call-count assertions (1 turn / 2 turns / 3 turns / retries) are
      unchanged in number.
- [ ] Keep the timeout test working: the `runStreamed` mock rejects (or yields an
      `error`/`turn.failed` event) when the injected `signal` aborts.

**Acceptance Criteria**:
- The pre-existing codex behaviours (success, usage mapping, RESULT_FILE_NOT_FOUND, timeout,
  base-branch propagation, enrichContext, session continuity, follow-up 2-turn execution,
  typed-outcome via outputSchema) all still pass through the `runStreamed` path.
- No production behaviour is asserted away; only the mocked primitive changes.

---

## T-09: New tests — retry, observability, output verification

Files under `tests/adapter/codex/` (new files alongside `agent-runner.test.ts`).

- [ ] `agent-runner-transient-retry.test.ts` — mirror the claude-code transient-retry
      suite for codex:
  - main turn: 1 transient → success, `transientRetryAttempts === 1`, one `step:retry`;
  - main turn: persistent transient → attempted `maxRetries + 1` times, `error`,
    `transientRetryAttempts === maxRetries`, `step:retry` ×`maxRetries`;
  - non-transient → 1 attempt, `error`, no `step:retry`, `transientRetryAttempts === 0`;
  - `maxRetries = 0` → 1 attempt, `error`, no `step:retry`, `transientRetryAttempts`
    absent;
  - **follow-up turn**: main succeeds, first `postWorkPrompts` turn transient once then
    succeeds → `success`, `transientRetryAttempts ≥ 1`, ≥1 `step:retry`.
  - Use `_sleepFn: async () => {}` and an `emit` spy collecting `step:retry` payloads.
  - Simulate a transient error either by rejecting `runStreamed` with
    `new Error("ConnectionRefused")` or by yielding a `turn.failed` event with a transient
    message; cover both shapes.
- [ ] `agent-runner-observability.test.ts`:
  - `logPath` set (a real temp file): after `run()`, the file exists, every line is
    JSON-parseable, and a `session:summary` line is present. `logPath` unset: the file is
    not created.
  - `step:progress`: a turn that yields an `item.started` for a `command_execution` causes
    an `emit("step:progress", { step, tool, ... })` call.
- [ ] `agent-runner-output-verification.test.ts`:
  - `ctx.policy.outputVerification.detect` returns one `follow-up` violation then none;
    assert one extra repair turn runs on the same thread and `completionReason === "success"`;
  - a repair-turn failure (rejecting `runStreamed`) is best-effort: result still reflects
    the work turn (no halt).

**Acceptance Criteria**:
- All new tests pass and pin: main+follow-up transient retry (with `step:retry` and
  `transientRetryAttempts`), non-transient no-retry, logPath JSONL present/absent,
  `step:progress` emission, and the outputVerification follow-up path.

---

## T-10: Green gate

- [ ] Run `bun run typecheck && bun run test`.
- [ ] Confirm the full suite is green, including the migrated codex tests (T-08), the new
      tests (T-09), and the untouched claude-code transient-error / session-log-writer tests
      (which resolve through the T-01/T-02 shims).

**Acceptance Criteria**:
- `bun run typecheck` exits 0.
- `bun run test` exits 0 with no failed or skipped tests.
