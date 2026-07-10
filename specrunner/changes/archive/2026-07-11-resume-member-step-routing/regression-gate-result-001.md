# Regression Gate Result — Iteration 1

- **change**: resume-member-step-routing
- **iteration**: 1
- **verdict**: approved

## Findings Verification

### Finding 1 — TC-008 rewritten to no-worktree mode
- **severity**: medium
- **file**: src/core/lifecycle/__tests__/exit-guard.test.ts:311
- **status**: fixed

TC-008 now creates the exit-guard handler with `createExitGuardHandler(tempDir, jobId, { noWorktree: true, slug })`, which invokes `handleNoWorktreeExit`. That path calls `appendInterruption`, so events.jsonl is a valid observable for the guard. The test simulates `markSignalHandlerFired()` before handler invocation and asserts `after === before` (no line appended). The test comment explicitly documents why global scan mode is vacuous for this assertion.

`handleNoWorktreeExit` (exit-guard.ts:57), `handlePerJobExit` (exit-guard.ts:84), and `handleGlobalExit` (exit-guard.ts:153) all have `if (isSignalHandlerFired()) return;` guards in place. No regression.

### Finding 2 — TC-015: signal-state.ts module contract tests
- **severity**: medium
- **file**: src/core/lifecycle/signal-state.ts (new file)
- **status**: fixed

`signal-state.ts` is a new module exporting `markSignalHandlerFired`, `isSignalHandlerFired`, and `resetSignalHandlerFiredForTest`. The three independent assertions in exit-guard.test.ts (lines 477–492) verify:
1. Initial value is `false` before any call
2. `markSignalHandlerFired()` sets it to `true`
3. `resetSignalHandlerFiredForTest()` restores it to `false`

These tests are explicit unit assertions on the module contract, not side-effect observations.

### Finding 3 — TC-016: markSignalHandlerFired called before first await
- **severity**: medium
- **file**: src/core/runtime/__tests__/signal-handler-order.test.ts (new file)
- **status**: fixed

The new test file mocks `JobStateStore.prototype.load` to capture `isSignalHandlerFired()` at the moment it is invoked, then asserts the captured value is `true`. In local.ts line 962, `markSignalHandlerFired()` is called synchronously before the `try {` block, which is before `await store.load()` at line 965. The ordering contract is verified automatically and will catch future regressions if the call is moved after the first await.

## Summary

All 3 findings are fixed and no regressions or contradictions were observed. The implementations are consistent: signal-state.ts provides the shared flag, local.ts sets it before the first await, and all three exit-guard paths check it before writing. The TC-008 rewrite makes the events.jsonl assertion meaningful by using a mode where appendInterruption is actually on the call path.
