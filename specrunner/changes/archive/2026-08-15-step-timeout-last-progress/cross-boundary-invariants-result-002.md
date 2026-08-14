# Cross-Boundary-Invariants Review — step-timeout-last-progress

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Prior-Round Findings: Resolution Status

### F-1 (Medium) — `onToolEnd(undefined)` best-effort match silently clears any in-flight tool — **RESOLVED**

Previous logic: `const correlates = id === last.id || id === undefined || last.id === undefined;`  
`id === undefined` was a standalone condition, so any id-less completion would clear any in-flight tool regardless of its `id`.

Current logic (`last-tool-tracker.ts:53`): `const correlates = last.id === undefined || id === last.id;`  
`id === undefined` is no longer a standalone condition. An id-less completion (`id = undefined`) only correlates when the *start* had no id (`last.id === undefined`). When the start has an id (`last.id = "id-A"`) and completion arrives with `id = undefined`, both conditions are false → does NOT clear → in-flight. ✓

TC-016 in `last-tool-tracker.test.ts` pins both directions:
- `onToolStart("Bash", "cmd", "id-A")` → `onToolEnd(undefined)` → hint: `in-flight` ✓
- `onToolStart("Bash", "cmd", undefined)` → `onToolEnd("any-id")` → hint: `completed before timeout` ✓

---

### F-2 (Low) — tracker state not reset between transient retry attempts — **RESOLVED**

`tracker.reset()` is now the first statement in `runMainWorkTurn` in both adapters (claude-code `agent-runner.ts:748`, codex `agent-runner.ts:521`). Each `retryWithBackoff(runMainWorkTurn, ...)` retry calls `runMainWorkTurn` again, which calls `tracker.reset()` before accumulating new tool observations. Elapsed time no longer spans retries plus backoff delays.

TC-021 in `last-tool-tracker.test.ts` pins: after `reset()`, `timeoutHint()` returns `no tool observed`. ✓

---

### F-3 (Low) — `isToolResult` applies to `SDKUserMessageReplay` in resumed sessions — **RESOLVED**

`observeMessage` closure (`agent-runner.ts:495`) now gates with:
```typescript
if ((msg as { isReplay?: true }).isReplay === true) return;
```
This fires before `emitToolProgress`, `isToolUse`, and `isToolResult` checks. Replayed messages (including `SDKUserMessageReplay` with `tool_result` content) update neither `step:progress` nor tracker state.

TC-022 in `agent-runner-timeout-last-tool.test.ts` pins: a replayed `tool_result` for `tu-1` does not clear the in-flight state for a non-replayed `tool_use tu-1`. ✓

---

## Invariants Verified (full enumeration)

### 1. `inactivity-watchdog.ts` byte-identical to main

`git diff main...HEAD -- src/adapter/shared/inactivity-watchdog.ts` → 0 lines.  
`formatInactivityTimeoutMessage` output, watchdog threshold, bump/clear/fired contract: untouched.  
**Invariant held.**

### 2. All six AC-#5 test files byte-identical to main and green

`git diff main...HEAD -- [six files]` → 0 lines.  
The six files: `inactivity-watchdog.test.ts`, `executor-sequential-regression.test.ts`, `commit-orchestrator.test.ts`, `executor-drift-detection.test.ts`, `no-op-detect-exemption.test.ts`, `agent-runner-transient-retry.test.ts`.  
**Invariant held.**

### 3. `step:progress` terminal display unchanged at all three sites

`observeMessage` calls `emitToolProgress(msg, ctx.emit, step.name)` as its first action (after the `isReplay` guard), before any tracker call. The three sites (main query loop line 679, postWork `runFollowUpQueryWithRetry` line 966, output-repair loop line 1043) all route through `observeMessage`. Terminal display behavior is byte-identical to pre-diff.

TC-005 spy assertion (`emitSpy.toHaveBeenCalledWith("step:progress", ...)`) pins site 1. TC-017 (sites 2 and 3) pins postWork and output-repair paths with separate test cases.  
**Invariant held.**

### 4. `makeTimeoutHalt` hint propagation unchanged

`step-halt.ts:131`: `hint: (err as Error & { hint?: string }).hint ?? ""` — no change. The new `{ code: "STEP_TIMEOUT", hint: tracker.timeoutHint() }` flows through without any code change to `makeTimeoutHalt`, `recordFailedStepResult`, or `event-journal.ts`. `timeoutHint()` always returns a non-empty string; `?? ""` is a no-op.

TC-011 pins `makeTimeoutHalt` boundary: `halt.error.hint === observationHint`.  
**Invariant held.**

### 5. Awaiting-resume halt transition unchanged

Executor timeout → `makeTimeoutHalt` kind/reason/resumePoint logic: untouched. `hint` (previously `""`) is now non-empty. No existing assertion checks `hint === ""` for STEP_TIMEOUT.  
**Invariant held.**

### 6. `managed-agent` adapter unchanged

`git diff main...HEAD -- src/adapter/managed-agent/` → 0 lines.  
**Invariant held.**

### 7. `tracker` scope correctly bounded to `run()`

Both adapters create `tracker = createLastToolTracker()` inside `run()` before the first `await`. Each `run()` invocation gets a fresh tracker; no shared state between jobs.  
**Invariant held.**

### 8. `isToolUse` and `isToolResult` are mutually exclusive

`isToolUse` requires `type === "stream_event"`. `isToolResult` requires `type === "user"`. No message can satisfy both. No branch can be taken twice for the same message.  
**Invariant held.**

### 9. `isReplay` guard covers all three observation sites

Site 1 (main query loop, line 679): `observeMessage(message)` includes guard. ✓  
Site 2 (postWork, line 966): `observeMessage` passed as `onMessage` to `runFollowUpQueryWithRetry` → called at line 804 → guard fires. ✓  
Site 3 (output-repair, line 1043): `observeMessage(message)` called directly → guard fires. ✓  
**Invariant held.**

---

## Findings

None. All three prior-round findings are resolved. No new cross-boundary invariant violations detected.

---

## Observations

### O-1: `isToolUse` called twice per `tool_use` message (unchanged from iter 1)

`observeMessage` calls `emitToolProgress` (which internally calls `isToolUse`), then calls `isToolUse` again in the closure body. Harmless — pure predicate, same result. Not a correctness concern.

### O-2: Resume fallback within `runMainWorkTurn` does not reset tracker

When `runMainWorkTurn` tries a resumed session, observes a tool, the session fails, and falls back to a fresh thread — `tracker.reset()` is NOT called before the fresh thread. State from the resume session is retained. If the fresh thread times out without emitting a new tool, the hint shows the resume session's tool with elapsed time spanning both sessions.

This is within the design's reset contract (reset per `retryWithBackoff` invocation, not per internal session switch). Design D2 explicitly says "`reset()` called at the start of each retry attempt." The internal resume fallback is a single `runMainWorkTurn` invocation. Accepted approximation; elapsed time may exceed the inactivity window in the rare resume-fail-then-timeout compound case.

### O-3: `reportRetry` follow-up path does not wire `observeMessage` (unchanged from iter 1)

Line 941: `runFollowUpQueryWithRetry(retryPrompt, retryOptions)` with no `onMessage` argument. Default `() => {}`. Tracker does not update during reportRetry turns. If timeout fires during reportRetry, hint reflects last tool from main or postWork phase. Per design D3, only the three explicitly listed sites are wired. Accepted.

---

## Evidence

- Read and analyzed: `last-tool-tracker.ts`, `message-types.ts`, `agent-runner.ts` (claude-code), `agent-runner.ts` (codex), `step-halt.ts`
- Read and analyzed: all three new test files (`last-tool-tracker.test.ts`, `agent-runner-timeout-last-tool.test.ts` × 2)
- Verified `git diff main...HEAD` for all 6 AC-#5 files → 0 lines (byte-identical to main)
- Verified `git diff main...HEAD -- src/adapter/shared/inactivity-watchdog.ts` → 0 lines
- Traced `isReplay` guard coverage across all three observation sites
- Traced `tracker.reset()` placement in both `runMainWorkTurn` functions vs `retryWithBackoff` invocation model
- Cross-checked SDK type `SDKUserMessageReplay.isReplay: true` against `observeMessage` guard condition
- Confirmed `isToolUse` and `isToolResult` type discriminants are mutually exclusive (`stream_event` vs `user`)
