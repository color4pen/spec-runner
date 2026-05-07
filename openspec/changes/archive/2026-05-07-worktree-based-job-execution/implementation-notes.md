# Implementation Notes: worktree-based-job-execution

## Summary

- **result**: completed
- **tasks_completed**: 24/24 (all phases)

## Files Modified

| Path | Operation | Description |
|------|-----------|-------------|
| `src/core/worktree/manager.ts` | created | WorktreeManager interface + createWorktreeManager factory with DI |
| `src/state/schema.ts` | modified | Added `worktreePath?: string | null` to JobState + backward compat comment |
| `src/cli/run.ts` | modified | Local runtime worktree creation, request file copy, signal handlers, pipeline cwd injection |
| `src/core/step/verification.ts` | modified | Removed temp worktree logic; uses deps.cwd directly |
| `src/core/verification/propagate.ts` | modified | Removed temp worktree; operates directly in job worktree cwd |
| `src/core/finish/types.ts` | modified | Added `worktreePath?: string | null` to ResolvedTarget |
| `src/core/finish/preflight.ts` | modified | Added worktreePath branch for Check 5+6; extracted runChecks5and6 helper |
| `src/core/finish/orchestrator.ts` | modified | Phase 1 uses worktree cwd if available; Phase 2 post-push merge state polling; Phase 4 worktree remove |
| `src/core/finish/resolve-target.ts` | modified | buildResolvedTarget propagates worktreePath from job state |
| `tests/core/worktree/manager.test.ts` | created | 11 tests for WorktreeManager create/remove/prune + JobState compat |
| `tests/unit/core/verification/propagate.test.ts` | modified | Rewritten for simplified no-temp-worktree behavior |
| `tests/finish-orchestrator.test.ts` | modified | Added TC-WT-FIN-001/002/003; updated makeJobWithPr to support worktreePath |
| `tests/unit/core/finish/preflight.test.ts` | modified | Added TC-WT-PRE-001/002 for worktree-based Check 5+6 |
| `tests/unit/cli/run-worktree-signal.test.ts` | created | TC-WT-SIG-001/002 for signal cleanup logic |

## Blocked Tasks

None. All 24 tasks completed.

## Key Design Decisions

- **WorktreeManager DI**: `createWorktreeManager(spawnFn?)` accepts optional spawn for testing. `FinishInput.worktreeManagerFn` provides injection for finish orchestrator tests.
- **fetch in preflight**: `fetchPrViewWithRetry` is called a second time after Phase 2 push to detect post-push mergeStateStatus=CLEAN (Design D6). Reuses existing retry logic.
- **propagate.ts interface change**: Removed `mkdtempFn` parameter (no longer needed). Removed `fetch` before git operations (job worktree is already on feature branch).
- **Signal handler exit code**: 130 = 128 + SIGINT(2) per Unix convention.
- **Backward compat**: All existing tests (939 baseline) pass. worktreePath is optional in schema; absent in legacy state files is treated as undefined.

## Test Count Delta

Baseline: 929 → Final: 947 (+18 new tests)
