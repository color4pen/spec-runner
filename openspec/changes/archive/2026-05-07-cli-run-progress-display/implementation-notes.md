## Result

**result**: completed
**tasks_completed**: 18/18

## Files Modified

| Path | Operation | Summary |
|------|-----------|---------|
| `src/logger/stdout.ts` | modified | Added `setVerbose()`, `isVerbose()` exports and module-level `verbose` flag; `logWarn` now returns early when `verbose=false` |
| `src/cli/run.ts` | modified | Added `verbose?: boolean` to `runRunCore`/`runRun` options; calls `setVerbose()` at entry; creates `EventBus` + `ProgressDisplay` and passes bus to `runPipeline` |
| `src/cli/progress.ts` | created | New `ProgressDisplay` class: subscribes to all domain events (`step:start`, `step:complete`, `step:error`, `verdict:parsed`, `pipeline:complete`, `pipeline:fail`) and prints progress lines to stdout |
| `src/core/pipeline/run.ts` | modified | `runPipeline` and `runProposePipeline` accept optional `events?: EventBus` third arg; internally use `bus = events ?? new EventBus()` |
| `bin/specrunner.ts` | modified | `run` case parses `--verbose` flag and passes it to `runRun`; updated USAGE string |
| `tests/unit/logger/stdout-verbose.test.ts` | created | Tests for `setVerbose(false)` suppression and `setVerbose(true)` output |
| `tests/unit/cli/progress.test.ts` | created | Tests for all `ProgressDisplay` event handlers via EventBus emit |

## Blocked Tasks

None.

## Notes

- All 909 tests pass (`bun run test`)
- TypeScript typecheck green (`bun run typecheck`)
- `logWarn` is now suppressed by default (verbose=false). This is intentional per design D3/D6 and matches the requirement that warnings are hidden unless `--verbose` is set.
