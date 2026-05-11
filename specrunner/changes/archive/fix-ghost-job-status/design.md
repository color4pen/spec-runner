# Design: fix-ghost-job-status

## Root Cause

`CommandRunner.execute()` creates job state (status=`"running"`) in `prepare()`, then proceeds to `setupWorkspace()` → `buildDeps()` → `registerCleanup()` → `pipeline.run()`. If any step between `prepare()` and `pipeline.run()` fails, the method returns exit code 1 without transitioning job state to `"failed"`.

The pipeline itself has a safety net (`pipeline.ts:81-108`) that transitions state to `"awaiting-resume"` on unhandled throws, so pipeline-phase errors are already handled. The gap is exclusively in the **pre-pipeline** phase within `runner.ts`.

### Affected Error Paths

| Location | Current behavior | Expected |
|----------|-----------------|----------|
| `setupWorkspace()` catch (L87-89) | `return 1` — state stays `running` | Transition to `failed`, then `return 1` |
| `buildDeps()` / `registerCleanup()` throw (L107-121) | Exception propagates — state stays `running` | Transition to `failed`, then `return 1` |

### Clarification on Acceptance Criteria

The request mentions "base-branch 未指定" as an example trigger. However, `base-branch` validation occurs in `runPreflight()` (called in `src/cli/run.ts`) **before** job state is created. Preflight failures never produce ghost jobs because no state file exists.

Ghost jobs occur when preflight passes but a subsequent step fails (e.g. git worktree creation fails, branch checkout fails). The fix targets this window.

## Design

### Approach: Fail-guard in error paths

Add `JobStateStore.fail()` calls to the two error paths in `CommandRunner.execute()` that currently leave state as `"running"`.

This uses the existing `JobStateStore.fail()` API (already the established pattern in `pipeline.ts:184`) rather than introducing new abstractions.

### Changes

**`src/core/command/runner.ts`**:

1. Import `JobStateStore` from `../../store/job-state-store.js`
2. In `setupWorkspace()` catch: call `store.fail(jobState, errorInfo, "init")` before `return 1`
3. Wrap `buildDeps` / `collectDynamicContext` / `registerCleanup` (L107-121) in try-catch with the same fail pattern
4. In the pipeline catch block: add a defensive guard — read state from disk, if still `"running"`, transition to `"failed"` (belt-and-suspenders for any edge case the pipeline safety net might miss)

### Error Info

```typescript
{
  code: "WORKSPACE_SETUP_FAILED",  // or "INIT_FAILED" for buildDeps/registerCleanup
  message: err.message,
  hint: "",
}
```

### State Transition Validity

`"running"` → `"failed"` is a valid transition per `VALID_TRANSITIONS` in `src/state/lifecycle.ts:37`.

### Impact on Existing Behavior

- Pipeline safety net (`pipeline.ts`) is unchanged — pipeline errors remain `"awaiting-resume"` (resumable)
- Preflight errors are unchanged — no state file is created
- `handleResult()` and `teardown()` callers are unaffected since the early return happens before those
- `specrunner ps` / `specrunner status` will now correctly show these jobs as `"failed"` instead of `"running"`

## Files to Modify

| File | Change |
|------|--------|
| `src/core/command/runner.ts` | Add fail-guard in 2 error paths + 1 defensive guard |
| `tests/unit/core/command/runner.test.ts` | Add tests for ghost job prevention |

## No Delta Spec Required

The existing `job-state-store` spec already defines `fail()` semantics. The `cli-commands` spec already states that failed runs exit 1. This fix closes an implementation gap without changing specified behavior.
