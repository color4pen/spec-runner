# Implementation Notes: fix-request-file-staging-in-worktree

- **result**: completed
- **tasks_completed**: 7/7

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/cli/run.ts` | modified | Added `spawnCommand` import from `../util/spawn.js`; added `git add <relativeRequestPath>` call after `fs.cp` with fail-fast on non-zero exit (cleanup + return 1) |
| `tests/unit/cli/run-worktree-git-staging.test.ts` | created | Unit tests for git staging failure path (TC-WT-STAGE-001, TC-WT-STAGE-002) using reconstruction pattern |
| `openspec/changes/fix-request-file-staging-in-worktree/tasks.md` | modified | Marked all tasks complete |

## Blocked Tasks

None.

## Notes

- `run.ts` does not inject `spawnCommand` via DI, so test 2.2 used the reconstruction pattern (same as `run-worktree-signal.test.ts`) to verify the failure path contract from Design D1.
- The `git add` cleanup on failure also calls `manager.remove` + `manager.prune` with `.catch(() => {})` to avoid masking the primary error, consistent with the best-effort cleanup pattern in the rest of the local runtime path.
- `openspec validate --strict` passes; `bun run typecheck` passes; 966 tests pass (109 test files).
