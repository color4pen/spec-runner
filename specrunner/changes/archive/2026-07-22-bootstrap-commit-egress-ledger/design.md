# Design: bootstrap-commit-egress-ledger

## Context

The egress backstop (`runInlineEgressCheck` in `src/core/step/commit-push.ts`) verifies that
every commit a push would newly publish (enumerated by `git rev-list HEAD --not --remotes=origin`)
is present in `state.synthesizedCommits`. This ledger is the authoritative record of
"commits the pipeline manufactured."

Three bootstrap paths each create a materialization commit (`add request.md for <slug>`),
but none captures the resulting OID or records it in the ledger:

| Path | File | Line | Context |
|------|------|------|---------|
| Worktree run (local) | `src/core/runtime/workspace-materializer.ts` | ~215 | `WorkspaceMaterializer.materialize()`, `new-run` arm |
| No-worktree run (local) | `src/core/runtime/local.ts` | ~406 | `LocalRuntime.setupWorkspaceNoWorktree()` |
| Managed run | `src/core/runtime/managed.ts` | ~236 | `ManagedRuntime.setupWorkspace()` run path |

Because the bootstrap commit is not yet pushed (it is uncommitted-to-origin at pipeline step 1),
it appears in the publish range at the first step's push. Since it is absent from the ledger,
the egress check throws `EGRESS_UNKNOWN_COMMIT` and halts the job.

Real incident: job ac3aa8bf, materialization commit f78c52e1d → `awaiting-resume`.
Operator hand-push unblocked the job.

The `appendSynthesizedCommit` pure helper (`src/state/schema/operations.ts:35`) already exists
and is idempotent; no new ledger infrastructure is needed.

## Goals / Non-Goals

**Goals**:
- Record the bootstrap materialization commit OID in `state.synthesizedCommits` at all 3 sites.
- Fail-closed: rev-parse failure during bootstrap aborts the job (no unlisted pipeline commits).
- Fix the first-push egress halt for all new jobs without any operator intervention.
- Add tests that pin the correct behaviour and catch regression.

**Non-Goals**:
- Changing `runInlineEgressCheck` or `verifyEgressLedger` (the strict publish-range calculation is correct; only the ledger was incomplete).
- Entry-HEAD narrowing or any other egress-check relaxation (design D4, as previously decided).
- Retroactive repair of already-halted jobs (already unblocked via operator hand-push).
- Operator hand-commit flows (they remain hand-pushed as today).
- Bootstrap-then-immediate-push as workaround for managed.ts (the ledger gap persists across network interruptions).

## Decisions

### D1: Capture bootstrap OID via `git rev-parse HEAD` at each commit site

Immediately after each successful `git commit`, call `git rev-parse HEAD` using the same
`spawnFn` already in scope. HEAD is guaranteed to refer to the just-created commit because:
- `git commit` is synchronous (the call returns after the object is written).
- No concurrent git operation can move HEAD between the commit and the rev-parse.

Rationale: inline capture at the commit site is the simplest and most robust approach.
Alternatives considered:
- Parsing `git commit` stdout for the abbreviated OID → fragile (locale/format-dependent).
- Returning the OID upward from a shared helper → requires refactoring all 3 call sites
  into a shared function; adds indirection without benefit given the simplicity of the fix.

### D2: Fail-closed on rev-parse failure

If `git rev-parse HEAD` returns a non-zero exit code, bootstrap throws an error and aborts.
For `workspace-materializer.ts`, the existing worktree cleanup pattern (manager.remove + prune)
is applied before throwing, consistent with the commit-failure cleanup already in that arm.
For `local.ts` and `managed.ts` (no-worktree paths), the error is thrown directly.

Rationale: a pipeline commit that is not in the ledger is an invariant violation. Silently
continuing would allow an unlisted commit to accumulate and cause an egress halt at push time,
which is exactly the bug we are fixing. Fail-closed is the only safe choice.
Alternatives considered:
- Logging a warning and continuing → recreates the bug on rev-parse flakiness.
- Using a sentinel value (empty string) → `appendSynthesizedCommit` already filters empty
  strings inside `runInlineEgressCheck`; but empty strings in the ledger are meaningless and
  would mask a real failure.

### D3: Persist via existing `updateJobState` + `appendSynthesizedCommit`

Each bootstrap site already calls `updateJobState(jobId, mutator, slugOpts)` immediately after
the commit. We add one `updateJobState` call to apply `appendSynthesizedCommit(s, oid)`:

- `workspace-materializer.ts`: after the commit block, using `this.host.updateJobState(jobId, s => appendSynthesizedCommit(s, oid), slugOpts)`.
- `local.ts`: after the commit block, using `this.updateJobState(jobId, s => appendSynthesizedCommit(s, oid), slugOpts)`.
- `managed.ts`: after the commit block, using `this.updateJobState(jobId, s => appendSynthesizedCommit(s, oid))` (managed store uses `currentSlug`, no explicit slugOpts).

Rationale: reusing the existing state update pathway keeps the change minimal and avoids
introducing a new persistence abstraction. `appendSynthesizedCommit` is already the canonical
ledger-append function and is idempotent, so repeated bootstrap (e.g., crash-resume that
re-materializes) is safe.

### D4: Import `appendSynthesizedCommit` in the 3 bootstrap modules

`appendSynthesizedCommit` from `src/state/schema/operations.ts` is not currently imported by
any of the 3 bootstrap files. A named import is added to each.

### D5: Egress verification logic is unchanged

`runInlineEgressCheck` and `verifyEgressLedger` in `src/core/step/commit-push.ts` remain
exactly as they are. The publish-range calculation (`rev-list HEAD --not --remotes=origin`)
is correct and must not be relaxed.

## Risks / Trade-offs

[Risk] `appendSynthesizedCommit` call ordering relative to the adjacent `updateJobState` calls could cause a load-persist race if the same state is loaded twice concurrently.

Mitigation: `updateJobState` implementations in both `local.ts` and `managed.ts` are sequential awaits (no concurrent loads). The existing calls immediately above/below the new call use the same sequential pattern. Race is not possible in single-threaded async JavaScript within a single pipeline run.

[Risk] `workspace-materializer.ts` rev-parse failure leaves a partial worktree before cleanup.

Mitigation: the cleanup sequence (manager.remove + prune) is identical to the existing commit-failure cleanup at lines 219–223 of `workspace-materializer.ts`. Failure during cleanup is already `.catch(() => {})` (best-effort), consistent with the existing pattern.

[Risk] Tests that manually seed `synthesizedCommits` with `git rev-list HEAD` (existing baseline seed in `tests/unit/step/test-materialize-boundary.test.ts`) might appear to test the wrong thing.

Mitigation: those seeds represent "commits already on origin before the job started" — a valid and distinct scenario (repo with pre-existing history, not bootstrap-derived). They are preserved as-is; only the new integration test omits the bootstrap OID from the seed to confirm the fix is load-bearing.

## Open Questions

None. The architect has evaluated and approved the design direction (ledger-side completeness).
Egress-check relaxation alternatives were explicitly rejected.
