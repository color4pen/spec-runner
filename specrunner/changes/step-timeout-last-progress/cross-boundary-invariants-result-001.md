# Cross-Boundary-Invariants Review — step-timeout-last-progress

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

```
src/adapter/shared/last-tool-tracker.ts            (new file)
src/adapter/shared/__tests__/last-tool-tracker.test.ts  (new file)
src/adapter/claude-code/message-types.ts           (isToolResult guard added)
src/adapter/claude-code/agent-runner.ts            (tracker + observeMessage wired)
src/adapter/codex/agent-runner.ts                  (tracker wired)
src/adapter/claude-code/__tests__/agent-runner-timeout-last-tool.test.ts  (new)
src/adapter/codex/__tests__/agent-runner-timeout-last-tool.test.ts        (new)
```

---

## Invariants Verified

### 1. `inactivity-watchdog.ts` is byte-identical to main

`git diff main...HEAD -- src/adapter/shared/inactivity-watchdog.ts` → empty.  
`inactivity-watchdog.test.ts` (TC-010–013) → zero diff, all pass.  
`formatInactivityTimeoutMessage` output is untouched; `STEP_TIMEOUT` error message is unchanged.  
**Invariant held.**

### 2. All six AC-#5 test files are byte-identical to main and green

Diff of all six files → zero lines. Full test suite: 768 files, 11469 tests, all green.  
**Invariant held.**

### 3. `step:progress` terminal display is unchanged at all observation sites

`observeMessage` calls `emitToolProgress(msg, ctx.emit, step.name)` as its first action, then adds tracker calls.  The three pre-existing call sites (main work loop line 673, postWork `runFollowUpQueryWithRetry` line 962, output-repair loop line 1036) now call `observeMessage` instead of bare `emitToolProgress`.  `emitToolProgress` signature and logic are untouched.  
**Invariant held.**

### 4. `makeTimeoutHalt` reads `hint` correctly

`step-halt.ts:131`: `hint: (err as Error & { hint?: string }).hint ?? ""`.  
The new `{ code: "STEP_TIMEOUT", hint: tracker.timeoutHint() }` on the error object flows through without any code change to `makeTimeoutHalt`, `recordFailedStepResult`, or `event-journal`.  
**Invariant held.**

### 5. Awaiting-resume halt transition is unchanged

The executor at `executor.ts:366` triggers `makeTimeoutHalt` on `completionReason === "timeout"`. The kind/reason/resumePoint logic in `makeTimeoutHalt` is untouched. Only `hint` (previously `""`) is now non-empty.  No existing assertion checks `hint === ""` for `STEP_TIMEOUT`.  
**Invariant held.**

### 6. `managed-agent` adapter is unchanged

`git diff main...HEAD -- src/adapter/managed-agent/` → empty.  
**Invariant held.**

### 7. `tracker` scope is correctly bounded to `run()`

`tracker` and `observeMessage` are declared inside `run()` before any `await`. All closures (`runQuery`, `executeTurn` for codex, `runFollowUpQueryWithRetry`) close over the same `tracker`. Each `run()` invocation creates a fresh tracker.  
**Invariant held.**

---

## Findings

### F-1 (Medium): `onToolEnd(undefined)` best-effort match silently clears any in-flight tool

**Location**: `src/adapter/shared/last-tool-tracker.ts:46`

```typescript
const correlates = id === last.id || id === undefined || last.id === undefined;
```

**Mechanism**: The `observeMessage` closure extracts `firstResult?.tool_use_id` from the first `tool_result` block. The `isToolResult` guard types `tool_use_id` as `optional` (defensive coding: the actual `ToolResultBlockParam` schema requires it). If `tool_use_id` is absent — whether from a synthetic message, a malformed replay, or a future SDK message type that incidentally passes `isToolResult` — `tracker.onToolEnd(undefined)` is called with `id === undefined`, which satisfies `correlates` for ANY in-flight tool regardless of its `last.id`.

**Consequence**: A `tool_result`-shaped user message without `tool_use_id` (synthetic stream, legacy format, or accidental false-positive from a future SDK message type) would mark the currently-tracked in-flight tool as "done". The subsequent `timeoutHint()` would report "completed before timeout" even though the tool was still running. This could mislead operator diagnosis — the very purpose of this feature.

**Bounds**: Real SDK `tool_result` blocks always carry `tool_use_id: string`. Synthetic test streams in the new tests explicitly include `tool_use_id`. The ponytail comment on line 45 documents the ceiling for the no-id fallback. In practice this only degrades for legacy or synthetic streams.

**Relation to unchanged code**: The `isToolResult` guard's optionality of `tool_use_id` was chosen to mirror the "defensive style of isToolUse" (design D3 / T-03). The asymmetry — guard typed as optional, but real SDK field is required — is the boundary crossed silently.

---

### F-2 (Low): `tracker` state is not reset between transient retry attempts of `runMainWorkTurn`

**Location**: `src/adapter/claude-code/agent-runner.ts` — `retryWithBackoff(runMainWorkTurn, ...)` (around line 843)

**Mechanism**: When `maxRetries > 0` and a transient error occurs, `retryWithBackoff` retries `runMainWorkTurn`. Each retry calls `runQuery`, which observes new stream events. The `tracker` is defined in `run()` scope and is NOT reset between retries. If the first attempt observes a `tool_use` (setting `last.startedAt = T₀`) and then fails transiently, the second attempt starts with `last !== null` and `last.done === false`. If the second attempt hits a timeout without seeing any tool_use, `timeoutHint()` reports the tool from the first attempt with `elapsed = now() - T₀` — this elapsed includes the retry delay, making it larger than the inactivity window.

**Consequence**: An operator reading the timeout hint after a transient-retry-then-timeout sequence would see an implausibly large elapsed time (e.g., 916000ms for a 15-minute watchdog with a 1-minute retry delay). The tool name is still correct but the timing is misleading.

**Bounds**: Only triggered when `maxRetries > 0` (non-default config) AND a transient error occurs AND the retry subsequently hits STEP_TIMEOUT without any new tool_use. Rare compound condition.

---

### F-3 (Low): `isToolResult` applies to `SDKUserMessageReplay` in resumed sessions

**Location**: `src/adapter/claude-code/agent-runner.ts` — `observeMessage` closure; `src/adapter/claude-code/message-types.ts:isToolResult`

**Mechanism**: `SDKUserMessageReplay` has `type: 'user'` (same as `SDKUserMessage`). The `isToolResult` guard checks only `type === "user"` and the content array structure — it does NOT check `isReplay`. When a session is resumed (`ctx.session.resumeSessionId`), the SDK may replay prior-session messages as `SDKUserMessageReplay`. If those replays include tool_result blocks, `tracker.onToolEnd` is called with the replayed `tool_use_id`.

**Consequence**: Replay tool_result messages update the tracker before the current session's events. After replays complete, the tracker correctly reflects the last replayed tool as "done". When the current session then starts a new tool_use, `onToolStart` replaces `last` and behavior is correct. The concern is a narrow window: if a timeout fires between replay and the first new tool_use in the resumed session, the hint reflects the replayed (previous-session) tool, not the current session's activity.

**Bounds**: Only in resumed sessions. The replayed tool would be "completed" (correct state), so the hint would say "completed before timeout" — which is accurate for the replayed tool. Not a correctness bug, but the tool shown is from the prior session, potentially confusing.

---

## Observations

### O-1: `emitToolProgress` called twice per tool_use message (once inside `observeMessage`, once via `isToolUse` check)

`observeMessage` first calls `emitToolProgress` (which internally calls `isToolUse`), then calls `isToolUse` again in the closure body. Harmless (pure function, same result), but `isToolUse` runs twice per message.

### O-2: `elapsed` in `timeoutHint()` measured at catch-block entry, not at watchdog fire time

Gap between watchdog fire (`abortController.abort()`) and the STEP_TIMEOUT catch block is non-zero in production (sub-millisecond). Under vitest fake timers the gap is zero. Design acknowledges this explicitly (Risks section). No impact on operator diagnosis.

### O-3: reportRetry follow-up path (line 937) does not pass `observeMessage`

`await runFollowUpQueryWithRetry(retryPrompt, retryOptions)` with no onMessage callback. This is pre-existing behavior (bare `emitToolProgress` was not called on this path before the diff either). Tracker does not update during reportRetry turns. If timeout fires during reportRetry, hint reflects last tool from the main work or postWork phase. Per design D3, only the three explicitly listed sites are wired.

### O-4: Tests pass consistently

Full suite: `bun run typecheck && bun run test` — 768 test files, 11469 tests, all green. Typecheck clean.

---

## Evidence

- Checked files: `last-tool-tracker.ts`, `message-types.ts`, `agent-runner.ts` (claude-code), `agent-runner.ts` (codex), `step-halt.ts`, `executor.ts`, `event-journal.ts`, `types.ts`, all new test files, all 6 AC-#5 test files, `inactivity-watchdog.ts`, `managed-agent/` (zero diff)
- Verified `git diff main...HEAD` for all 6 AC-#5 files → zero lines
- Ran full `bun run typecheck && bun run test` → clean
