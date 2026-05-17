# Implementation Notes: finish-phase0-local-conflict-check

## Summary

- **result**: completed
- **tasks_completed**: 6/6
- **test_cases**: 15 new unit tests (TC-LCC-1 through TC-LCC-5 × multiple assertions) + 6 orchestrator integration tests (TC-LCC-ORCH-1 through TC-LCC-ORCH-6); all 1950 total tests passing

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/core/finish/local-conflict-check.ts` | created | New module: `runLocalConflictCheck` — git fetch + git merge-tree --write-tree conflict detection; throws on fetch failure, returns `{ ok: true }` or `{ ok: false, conflictPaths }` |
| `src/core/finish/orchestrator.ts` | modified | Import `runLocalConflictCheck`; insert Phase 0 local conflict check block between `runPreflight` and dry-run check; skip when `dryRun` or PR already MERGED; catch fetch errors as escalation |
| `tests/unit/core/finish/local-conflict-check.test.ts` | created | Unit tests for `runLocalConflictCheck`: TC-LCC-1 (no conflict), TC-LCC-2 (conflict with paths), TC-LCC-3 (fetch failure throws), TC-LCC-4 (exit 1 + no parseable paths), TC-LCC-5 (multiple paths) |
| `tests/finish-orchestrator.test.ts` | modified | Added TC-LCC-ORCH-1 through TC-LCC-ORCH-6: conflict fail blocks Phase 1, pass proceeds, fetch fail escalates, escalation message content, re-run not blocked, dry-run skips check |
| `specrunner/changes/finish-phase0-local-conflict-check/specs/cli-finish-command/spec.md` | verified | Delta spec already present (created by prior step); documents check #8 in Phase 0 table with scenarios |

## Implementation Decisions

**Exit code as authority**: `git merge-tree --write-tree` exit code non-0 is the primary conflict signal. Path extraction from stdout is best-effort — empty `conflictPaths` still returns `{ ok: false }`.

**`--write-tree` flag**: Used to keep merge-tree read-only (no worktree modification). This is git 2.38+ behavior, consistent with the rest of the codebase.

**cwd selection**: `target.worktreePath ?? cwd` — conflict check runs in the job worktree if available, falling back to main cwd (managed mode). Matches Phase 1 `archiveCwd` pattern.

**No state mutation on conflict**: Job state intentionally not modified on conflict detection, matching existing Phase 0 escalation patterns. This allows `assertJobFinishable` to pass on re-run after `git rebase`.

**makeHappyPathSpawn compatibility**: The existing `makeHappyPathSpawn` in orchestrator tests has a catch-all `return Promise.resolve({ exitCode: 0, ... })` at the bottom. `git merge-tree` falls through to this, returning exit 0 (no conflict) — existing tests required zero changes.

## Blocked Tasks

None.
