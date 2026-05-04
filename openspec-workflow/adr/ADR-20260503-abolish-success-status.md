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
