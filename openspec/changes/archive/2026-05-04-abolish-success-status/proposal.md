# Proposal: Abolish `success` JobStatus and Replace with `awaiting-merge`

## Background / Why

The current `JobStatus` type defines `"success"` as one of its enumerated values alongside `"running" | "failed" | "terminated" | "archived"`. However, the semantics of `"success"` are ambiguous and conflated across two distinct lifecycle events:

1. **Step-level completion**: `executor.ts:195` and `:733` unconditionally write `status: "success"` to the job-level state immediately after parsing a review-style step verdict, regardless of whether the pipeline has completed.
2. **Pipeline termination**: `executor.ts:411` writes `status: "success"` when the propose pipeline reaches its final step.

This dual usage creates a race condition where:

- The CLI's completion check (`cli/run.ts:184`) reads `finalState.status === "success"` and concludes the pipeline has finished successfully, even when the job is still mid-execution (e.g., after spec-review iteration 1, or during verification attempts).
- When a pipeline exhausts retries and escalates, the state may already carry `status: "success"` from an intermediate step, causing the CLI to emit "Pipeline completed successfully" for a failed job.

Additionally, `assertJobFinishable` (used by the `finish` command) currently only rejects `status === "running"`, allowing `failed` and `terminated` jobs to be archived via `finish`, which overwrites their terminal error states and loses failure forensics.

The spec already anticipates `awaiting-merge` as a JobStatus value (see `openspec/specs/cli-finish-command/spec.md`: _"note: awaiting-merge is a JobStatus value (not a filesystem dir)"_). The implementation has not caught up, creating a spec-to-code drift.

### Exposed by dogfooding

- **PR #67**: The implementer agent incorrectly wrote `status: "success"` at line 195 during verification iteration 1, causing the CLI to misreport completion for an in-progress pipeline.
- **PR #68**: Verification propagation fix highlighted that retries-exhausted jobs did not transition to `status: "failed"`, remaining in `"success"` even after escalation.

## What / Proposal Overview

Replace the `success` JobStatus with `awaiting-merge` to encode the precise lifecycle phase: _pipeline has completed all required steps; PR is created; human merge is pending_.

**Core Changes**:

1. **Schema**: Update `JobStatus` type in `src/state/schema.ts` to:
   ```ts
   export type JobStatus =
     | "running"           // pipeline is executing
     | "awaiting-merge"    // pipeline complete, PR created, waiting for finish
     | "failed"            // unrecoverable error
     | "terminated"        // external session termination
     | "archived"          // finish command completed
   ```

2. **Executor**: Remove incorrect mid-pipeline `status: "success"` writes at lines 195 and 733; replace pipeline-end write at line 411 with `status: "awaiting-merge"`.

3. **CLI run command**: Update `cli/run.ts:184` to check `status === "awaiting-merge"` instead of `"success"`.

4. **finish command gate**: Strengthen `assertJobFinishable` to only allow `"awaiting-merge"` through the finish workflow; reject `"running"` / `"failed"` / `"terminated"` with actionable hints.

5. **Exhaustion handler**: Modify `handleExhausted` in `pipeline.ts:303` to write `status: "failed"` when retries are exhausted.

6. **Backward compatibility**: Add a 1-time migration in `state/store.ts` to remap legacy `status: "success"` to `"awaiting-merge"` on read.

## Impact Scope

- **Files modified**:
  - `src/state/schema.ts` (type definition)
  - `src/core/step/executor.ts` (3 sites: remove 2, update 1)
  - `src/cli/run.ts` (completion check)
  - `src/core/finish/job-state-update.ts` (assertJobFinishable guard)
  - `src/core/pipeline/pipeline.ts` (handleExhausted status write)
  - `src/state/store.ts` (backward compat migration)
  - `tests/finish-job-state.test.ts` and related test files (update assertions)

- **Breaking changes**: None for end users (state file migration is transparent). Internal code that pattern-matches on `status === "success"` will need updates (covered by TypeScript compiler).

- **Spec changes**: None required; this change aligns implementation with existing spec references to `awaiting-merge`.

## Acceptance Criteria

- [ ] `JobStatus` type no longer includes `"success"`.
- [ ] `JobStatus` type includes `"awaiting-merge"`.
- [ ] No `status: "success"` writes remain in `executor.ts`.
- [ ] Pipeline-end write in `executor.ts:411` sets `status: "awaiting-merge"`.
- [ ] `cli/run.ts` completion check uses `status === "awaiting-merge"`.
- [ ] `assertJobFinishable` only permits `"awaiting-merge"` jobs to proceed; rejects `"failed"` / `"terminated"` with distinct error hints.
- [ ] `handleExhausted` writes `status: "failed"` on retries exhausted.
- [ ] Legacy `status: "success"` state files load without crash, mapping to `"awaiting-merge"`.
- [ ] Existing `status: "archived"` jobs remain finishable via idempotent path (TC-126 preserved).
- [ ] `bun run typecheck` / `bun run lint` / `bun run test` all pass.
- [ ] ADR documenting the decision is committed to `openspec-workflow/adr/`.

## Out of Scope (Future Work)

- Renaming occurrences of "successful" or "success" in user-facing messages, system prompts, or documentation (separate chore).
- Evaluating whether `executor.ts:411` is the correct location for the pipeline-end write (e.g., should it be in pr-create step? code-review approved?).
- UX improvements for visualizing `awaiting-merge` state (e.g., `ps` command output colors).
- Timeline for removing the backward compatibility migration layer (can be deprecated 1-2 releases after deployment).
- Implementation of `cancel` command pathways for `failed` / `terminated` jobs.
