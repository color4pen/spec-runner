# Implementation Tasks: Abolish `success` JobStatus

## Schema and Type Changes

- [x] **T1.1**: Update `src/state/schema.ts` line 5 to replace `JobStatus` type definition:
  - Remove `"success"` from the union
  - Add `"awaiting-merge"` to the union
  - Result: `export type JobStatus = "running" | "awaiting-merge" | "failed" | "terminated" | "archived";`

- [x] **T1.2**: Add backward compatibility migration in `src/state/schema.ts:validateJobState` function:
  - After line 276 (existing `SESSION_TIMEOUT` migration), insert new migration block:
    ```ts
    // Backward compat: remap legacy status="success" to "awaiting-merge"
    // TODO: Remove this migration after 2026-06 release
    if (obj["status"] === "success") {
      obj["status"] = "awaiting-merge";
    }
    ```

## Executor Changes

- [x] **T2.1**: Remove incorrect step-level status write in `src/core/step/executor.ts:196`:
  - Delete line `state = await store.update(state, { status: "success" });`
  - Leave surrounding lines (history append at 189-194, persist at 197) unchanged

- [x] **T2.2**: Update pipeline-end status write in `src/core/step/executor.ts:412`:
  - Change `state = await store.update(state, { status: "success", step: "success" });` to:
    ```ts
    state = await store.update(state, { status: "awaiting-merge", step: "success" });
    ```
  - Update history message at line 417 from "Propose pipeline completed successfully" to "Propose pipeline completed; awaiting merge"

- [x] **T2.3**: Find and remove second step-level status write in `src/core/step/executor.ts` around line 733:
  - Search for `status: "success"` in review-style step execution path
  - Delete the entire `state = await store.update(state, { status: "success" })` statement
  - Verify adjacent code (verdict parsing, step result recording) remains intact

## CLI Run Command Changes

- [x] **T3.1**: Update completion check in `src/cli/run.ts:184`:
  - Change `if (finalState.status === "success")` to `if (finalState.status === "awaiting-merge")`

- [x] **T3.2**: Update completion message in `src/cli/run.ts:185`:
  - Change log message from `"Pipeline completed successfully. Branch: ..."` to `"Pipeline completed; awaiting merge. Branch: ..."`

## Finish Command Changes

- [x] **T4.1**: Strengthen `assertJobFinishable` guard in `src/core/finish/job-state-update.ts:17-25`:
  - Replace entire function body with:
    ```ts
    if (state.status === "archived") {
      // Idempotent: already archived (TC-126)
      return;
    }
    if (state.status === "awaiting-merge") {
      // Happy path: pipeline complete, ready to finish
      return;
    }
    if (state.status === "running") {
      throw new SpecRunnerError(
        ERROR_CODES.JOB_NOT_FINISHABLE,
        "Wait for the running job to complete before finishing.",
        `Cannot finish job ${state.jobId}: status is 'running'. The job is still in progress.`,
      );
    }
    // failed or terminated
    throw new SpecRunnerError(
      ERROR_CODES.JOB_NOT_FINISHABLE,
      "Use 'specrunner cancel' to clean up failed or terminated jobs.",
      `Cannot finish job ${state.jobId}: status is '${state.status}'. Finish is only for successfully completed pipelines.`,
    );
    ```

## Pipeline Exhaustion Handler Changes

- [x] **T5.1**: Update `handleExhausted` in `src/core/pipeline/pipeline.ts:303`:
  - After line 315 (the `updatedSteps` assignment), add status update:
    ```ts
    // Set status to failed when retries are exhausted
    // (existing error.code is already set by subsequent code)
    ```
  - Find the location where `handleExhausted` returns the updated state (likely after line 330 where error is constructed)
  - Ensure the returned state includes `status: "failed"` alongside the existing error object
  - **Note to implementer**: Review the full function to locate the precise insertion point; the state update must happen before the function returns

## Test Updates

- [x] **T6.1**: Update `tests/finish-job-state.test.ts`:
  - **TC-029** (line 40): Change default parameter in `makeJob` function from `status: JobState["status"] = "success"` to `status: JobState["status"] = "awaiting-merge"`
  - **TC-029** (line 61): Change `await makeJob("success")` to `await makeJob("awaiting-merge")`
  - **TC-029** (line 79): Change comment and assertion from `expect(stateAfter.status).toBe("success")` to `expect(stateAfter.status).toBe("awaiting-merge")`
  - **TC-031** (line 93-98): Update "does not throw for success status" test to "does not throw for awaiting-merge status"; change `await makeJob("success")` to `await makeJob("awaiting-merge")`

- [x] **T6.2**: Add backward compatibility test in `tests/finish-job-state.test.ts`:
  - Insert new test case after TC-031 section (after line 106):
    ```ts
    describe("Backward compatibility: legacy status=success", () => {
      it("loads legacy success state as awaiting-merge", async () => {
        const job = await makeJob("awaiting-merge");
        const jobsDir = path.join(tempDir, "specrunner", "jobs");
        const statePath = path.join(jobsDir, `${job.jobId}.json`);
        
        // Write legacy state with status="success"
        const raw = JSON.parse(await fs.readFile(statePath, "utf-8"));
        raw.status = "success";
        await fs.writeFile(statePath, JSON.stringify(raw, null, 2));
        
        // Load and verify migration
        const loaded = await loadJobState(job.jobId);
        expect(loaded.status).toBe("awaiting-merge");
      });
    });
    ```

- [x] **T6.3**: Search and update other test files:
  - Run `grep -r 'status.*"success"' tests/` to find all test assertions
  - For each occurrence, determine if it's testing:
    - Pipeline completion → replace with `"awaiting-merge"`
    - Mid-execution state → replace with `"running"` (should not be `"success"` anymore)
    - Failure cases → replace with `"failed"` or `"terminated"` as appropriate
  - Update assertions and test data accordingly

- [x] **T6.4**: Update test file docstrings and comments:
  - `tests/finish-job-state.test.ts` line 4: Change "TC-029: success → status: "archived"" to "TC-029: awaiting-merge → status: "archived""
  - `src/core/finish/job-state-update.ts` line 4: Change comment to match

## ADR Documentation

- [x] **T7.1**: Create `openspec-workflow/adr/ADR-20260503-abolish-success-status.md` with content:

````markdown
# ADR-20260503: Abolish `success` JobStatus

## Status

Accepted (2026-05-03)

## Context

The `JobStatus` type previously included `"success"` as a terminal state. However, this value was ambiguously used for two distinct events:

1. **Mid-pipeline step completion**: `executor.ts` wrote `status: "success"` after each review-style step verdict was parsed, even though the pipeline was still running.
2. **Pipeline termination**: The propose executor wrote `status: "success"` when reaching the final step.

This dual usage caused bugs:

- The CLI's `run` command checked `status === "success"` to determine pipeline completion, falsely triggering for in-progress jobs (exposed in PR #67).
- When pipelines exhausted retries and escalated, the state retained residual `status: "success"` from earlier steps, causing the CLI to report "completed successfully" for failed jobs.
- The `finish` command's `assertJobFinishable` guard only rejected `status === "running"`, allowing `failed` / `terminated` jobs to be archived and lose their error state.

The spec (`openspec/specs/cli-finish-command/spec.md`) already referenced `awaiting-merge` as a JobStatus value, indicating implementation drift.

## Decision

We **abolish** the `"success"` JobStatus entirely and replace it with `"awaiting-merge"` to precisely encode the lifecycle phase: _pipeline has completed all steps; PR is created; waiting for human merge via `finish`_.

### Changes

1. **Schema**: `JobStatus` type is now `"running" | "awaiting-merge" | "failed" | "terminated" | "archived"`.
2. **Executor**:
   - Removed two incorrect mid-pipeline writes of `status: "success"` (executor.ts:195, :733).
   - Updated pipeline-end write (executor.ts:411) to `status: "awaiting-merge"`.
3. **CLI**: Updated `run.ts:184` to check `status === "awaiting-merge"` for completion.
4. **Finish guard**: `assertJobFinishable` now only permits `"awaiting-merge"` and `"archived"` (idempotent path); rejects `"running"` / `"failed"` / `"terminated"` with actionable hints.
5. **Exhaustion handler**: `handleExhausted` writes `status: "failed"` when retries are exhausted.
6. **Backward compatibility**: `loadJobState` remaps legacy `status: "success"` to `"awaiting-merge"` on read (1-time migration, planned for removal after 2026-06).

### Why Not Keep `success` as an Alias?

- TypeScript's exhaustiveness checking forces compile-time auditing of all pattern-match sites, ensuring comprehensive migration.
- An alias would permit legacy code to perpetuate the ambiguous term, deferring debt rather than resolving it.

### Why Not Allow Finish for Failed Jobs?

- `finish` semantics are "merge the PR; archive the change." Applying it to failed jobs would destroy forensic evidence.
- The appropriate pathway for failed jobs is `cancel` (not yet implemented; separate scope).

## Consequences

### Positive

- **Lifecycle clarity**: Status field now has 1:1 correspondence with pipeline phases.
- **Bug prevention**: Eliminates the root cause of CLI misreporting and incorrect state transitions.
- **Spec alignment**: Implementation matches spec's existing `awaiting-merge` reference.
- **Type safety**: Compiler enforces correct handling at all status read/write sites.

### Negative

- **One-time migration cost**: All code sites checking `status === "success"` must be updated (mitigated by TypeScript compiler).
- **Temporary migration layer**: `loadJobState` has added complexity for 1-2 releases (planned for removal).

### Neutral

- Existing state files with `status: "success"` are transparently migrated on read; no user intervention required.
- The term "successful" may persist in user-facing messages or docs (separate cleanup; out of scope).

## Notes

- Related work: `cancel` command for disposing of `failed` / `terminated` jobs (future change).
- Migration layer removal: Target 2026-06 release (1-2 releases after this change lands).
````

## Verification

- [x] **T8.1**: Run `bun run typecheck` and verify no TypeScript errors related to `JobStatus`

- [x] **T8.2**: Run `bun run lint` and verify no linting errors

- [x] **T8.3**: Run `bun run test` and verify all tests pass

- [x] **T8.4**: Run `grep -r '"success"' src/` to audit remaining string literals:
  - Review each occurrence for runtime impact (error messages, logs, comments)
  - Update if ambiguous; document as out-of-scope if purely cosmetic

- [x] **T8.5**: Manual smoke test (if test infrastructure permits):
  - Create a state file with legacy `status: "success"`
  - Load it via `loadJobState` and verify it reads as `"awaiting-merge"`
  - Run finish command on an `awaiting-merge` job and verify it archives successfully

## Completion Checklist

All tasks above must be completed and verified before the change is considered ready for merge.
