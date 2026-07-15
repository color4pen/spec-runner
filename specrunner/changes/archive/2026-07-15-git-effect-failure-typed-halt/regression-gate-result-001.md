# Regression Gate Result — Iteration 001

- **verdict**: needs-fix

## Ledger Verification

### Finding: TC-016（must）spawn failure path not threaded into commitAndPush

**Original severity**: LOW  
**Status**: REGRESSION — finding is NOT fixed

#### Evidence

`makeGitSpawnFn` in `tests/unit/step/commit-and-push.test.ts` still emits only `close` events (line 237), never `error` events. There is no test in the file that simulates a spawn failure (ChildProcess emitting `error` → `gitExecResult` returning `{ok: false, exitCode: -1}`).

TC-016 (must-priority, `test-cases.md` line 168–180) specifies:

> GIVEN `gitExecResult` が `git add` で `{ ok: false, exitCode: -1 }` を返す（spawn 失敗）  
> WHEN `commitAndPush` を実行する  
> THEN `commitEffectFailedError`（code `COMMIT_AND_PUSH_FAILED`, operation `"stage"`）が throw される

The added tests (TC-CAP-008, TC-CAP-009) cover `addResult.exitCode !== 0` via `exitCode: 128`, but not the `!addResult.ok` branch (spawn failure). `gitExecResult` unit tests in `tests/unit/util/git-exec.test.ts` confirm `ok: false` behavior for `gitExecResult` itself, but that does not satisfy TC-016's requirement for an in-context integration test inside `commitAndPush`.

#### Fix required

Add a `makeGitSpawnErrorFn` helper (or extend `makeGitSpawnFn` with an `errorSubcommands` option) that emits `error` on the ChildProcess for the targeted subcommand, and add a test:

```typescript
describe("TC-CAP-012 / TC-016: git add spawn failure → COMMIT_AND_PUSH_FAILED halt", () => {
  it("rejects with COMMIT_AND_PUSH_FAILED when git add spawn fails (ok:false)", async () => {
    // spawnFn emits error event for "add" → gitExecResult returns {ok:false, exitCode:-1}
    // expect rejects with code: "COMMIT_AND_PUSH_FAILED"
    // expect diff/commit/push NOT called
  });
});
```

Same gap applies to `commitScopedPaths` (per original finding).
