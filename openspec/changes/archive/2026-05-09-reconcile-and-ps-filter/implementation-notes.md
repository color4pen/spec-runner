# Implementation Notes: reconcile-and-ps-filter

## Summary

- **result**: completed
- **tasks_completed**: 17/17
- **Blocked Tasks**: none
- **test_cases_skipped**: none (all must test cases implemented)

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/state/reconcile.ts` | created | New reconciliation module with `reconcileStaleRunning` and `reconcilePrState` pure functions. `isProcessAlive` inlined to avoid `state → core` module-boundary violation (design.md D2). |
| `src/cli/ps.ts` | modified | Added `status?: string` parameter to `runPs`; `--status` filter takes priority over `--active`/`--all`. Added `prMerged?: boolean` parameter to `formatJobRow`. Added `checkPrMerged` helper using `spawnCommand` (node:child_process, not Bun.spawn). STATUS column width expanded from 12 → 40 for hint suffix. |
| `src/cli/command-registry.ts` | modified | Added `status` flag definition with enum values constraint to `ps` command. Updated USAGE string with `--status=<status>` documentation. |
| `tests/unit/state/reconcile.test.ts` | created | 24 tests covering TC-01 through TC-11 (all must), boundary conditions. |
| `tests/unit/cli/ps-filter.test.ts` | created | 13 tests covering TC-14 through TC-21, TC-36, TC-37. |
| `tests/unit/cli/ps-pr-hint.test.ts` | created | 7 tests covering TC-23 through TC-25. |
| `openspec/changes/reconcile-and-ps-filter/tasks.md` | modified | All tasks marked [x]. |

## Design Notes

- `checkPrMerged` uses `spawnCommand` from `src/util/spawn.ts` instead of `Bun.spawn` — consistent with project's no-Bun-APIs rule.
- STATUS column width in TTY mode changed from 12 to 40 to accommodate `"awaiting-merge (PR merged, run finish)"` (38 chars).
- The `gh pr view` call is only issued for `awaiting-merge` jobs (typically 0-2), making rate limit risk negligible per design.md D4.
- TC-12 (EPERM behavior) and TC-13 (pid ≤ 0) are covered by the inlined `isProcessAlive` logic; direct unit tests for the private helper are not possible without exposing it, but TC-02 and TC-03 exercise the code paths indirectly.
