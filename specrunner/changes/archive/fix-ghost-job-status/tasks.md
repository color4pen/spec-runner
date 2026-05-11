# Tasks: fix-ghost-job-status

## [x] Task 1: Add fail-guard to setupWorkspace error path

**File**: `src/core/command/runner.ts`

1. Add import: `import { JobStateStore } from "../../store/job-state-store.js";`
2. In the `setupWorkspace()` catch block (currently L87-89), before `return 1`:

```typescript
// Before:
} catch (err) {
  process.stderr.write(`Error: Failed to set up workspace: ${(err as Error).message}\n`);
  return 1;
}

// After:
} catch (err) {
  const store = new JobStateStore(jobState.jobId);
  await store.fail(jobState, {
    code: "WORKSPACE_SETUP_FAILED",
    message: (err as Error).message,
    hint: "",
  }, "init");
  process.stderr.write(`Error: Failed to set up workspace: ${(err as Error).message}\n`);
  return 1;
}
```

## [x] Task 2: Add fail-guard to buildDeps/registerCleanup error path

**File**: `src/core/command/runner.ts`

Wrap the section from `buildDeps` through `registerCleanup` (currently L107-121) in a try-catch:

```typescript
let deps: PipelineDeps;
let handle: CleanupHandle;
try {
  deps = this.runtime.buildDeps(config, repo, request, slug, workspace);
  // collectDynamicContext (existing try-catch stays inside)
  try {
    deps.dynamicContext = await collectDynamicContext(workspace.cwd, request.baseBranch);
  } catch { /* swallow */ }
  handle = this.runtime.registerCleanup(jobState.jobId, startStep);
} catch (err) {
  const store = new JobStateStore(jobState.jobId);
  await store.fail(jobState, {
    code: "INIT_FAILED",
    message: (err as Error).message,
    hint: "",
  }, "init");
  process.stderr.write(`Error: ${(err as Error).message}\n`);
  return 1;
}
```

## [x] Task 3: Add defensive guard in pipeline catch

**File**: `src/core/command/runner.ts`

In the pipeline catch block (currently L128-132), add a disk-state check before the existing logic:

```typescript
} catch (err) {
  // Defensive: if pipeline safety net did not transition state, mark as failed
  try {
    const store = new JobStateStore(jobState.jobId);
    const diskState = await store.load();
    if (diskState.status === "running") {
      await store.fail(diskState as JobState, {
        code: "PIPELINE_UNHANDLED_ERROR",
        message: (err as Error).message,
        hint: "",
      }, jobState.step);
    }
  } catch { /* best-effort — don't mask original error */ }
  outputPipelineThrowError(err, jobState.branch);
  await this.runtime.teardown(handle, "error");
  return 1;
}
```

## [x] Task 4: Add unit tests

**File**: `tests/unit/core/command/runner.test.ts`

Add test cases:

### TC-CR-009: setupWorkspace failure marks job as failed

- Configure `buildMockRuntime({ setupThrow: new Error("worktree failed") })`
- Create a real job state via `JobStateStore.create()` (using temp XDG dir already in beforeEach)
- Use that jobId in the PrepareResult
- After `execute()`, load state from disk via `new JobStateStore(jobId).load()`
- Assert `state.status === "failed"`
- Assert `state.error.code === "WORKSPACE_SETUP_FAILED"`
- Assert exit code is 1

### TC-CR-010: pipeline throw with running state marks job as failed on disk

- Mock `createStandardPipeline` to return `{ run: rejects with Error }`
- Create a real job state file on disk (status "running")
- After `execute()`, load state from disk
- Assert `state.status === "failed"` (defensive guard triggered)
- Assert `state.error.code === "PIPELINE_UNHANDLED_ERROR"`

### TC-CR-011: pipeline throw with awaiting-resume state (safety net already fired) does not overwrite

- Mock `createStandardPipeline` to reject, but also write state file as "awaiting-resume" on disk before throwing (simulating the pipeline safety net)
- After `execute()`, load state from disk
- Assert `state.status === "awaiting-resume"` (not overwritten to "failed")

## [x] Task 5: Verify

- `bun run typecheck` passes
- `bun run test` passes
- Manual: create a request.md with a non-existent base-branch, run `specrunner run` in a scenario where setupWorkspace fails, confirm `specrunner ps` shows status "failed"
