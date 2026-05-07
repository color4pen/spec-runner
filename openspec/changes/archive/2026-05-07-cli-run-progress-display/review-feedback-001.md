# Code Review — cli-run-progress-display

- **iteration**: 1
- **verdict**: approved
- **date**: 2026-05-07

## Summary

Clean, well-scoped change. All 5 requirements met: step transition display, elapsed time, next-action hint, verbose-controlled warning suppression, EventBus subscriber pattern. Backward compatibility maintained via optional `events` parameter. Architecture decision (ProgressDisplay in CLI layer, EventBus DI) is sound. Typecheck and 909 tests pass.

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.15** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | maintainability | src/cli/run.ts:152 | `new ProgressDisplay(events, ...)` instantiated without storing reference. Intent is fire-and-forget but pattern is a code smell (`no-new`). No dispose/unsubscribe path for handlers registered on EventBus | Store as `const _display = new ProgressDisplay(...)` to clarify intent, or add `dispose()` method that calls `events.off()` for each handler |
| 2 | LOW | maintainability | src/cli/progress.ts:15 | `verbose` in `ProgressDisplay.options` is stored but never read by any handler method. Dead field | Remove from options type if ProgressDisplay has no verbose-dependent behavior, or add `// reserved for future use` comment |
| 3 | LOW | correctness | src/cli/progress.ts:49 | `onPipelineComplete(_p: unknown)` uses `unknown` while all other handlers properly type their payload. Inconsistent and loses type safety | Type as `_p: { state: JobState }` consistent with `EventPayloadMap["pipeline:complete"]` |
| 4 | LOW | testing | tests/unit/cli/progress.test.ts | Missing edge case: `step:complete` emitted without prior `step:start` (should show `0s` silently). Current `elapsedSeconds` handles this but no test proves it | Add a test that emits `step:complete` without `step:start` and asserts `(0s)` output |

## Requirement Coverage

| Requirement | Status |
|-------------|--------|
| step transition stdout display | Covered: `step:start` / `step:complete` / `step:error` handlers |
| elapsed time per step | Covered: `elapsedSeconds()` calculation from `stepStartTimes` Map |
| next-action display on complete | Covered: `pipeline:complete` handler outputs `Next: bun ./bin/specrunner.ts finish <slug>` |
| `--verbose` warning suppression | Covered: `setVerbose(false)` makes `logWarn` early-return. Flag parsed in `bin/specrunner.ts` |
| EventBus subscriber pattern | Covered: `ProgressDisplay.subscribe()` registers on all 6 event types. `runPipeline` accepts optional `EventBus` |
| `bun run typecheck && bun run test` green | Verified: typecheck clean, 909/909 tests pass |

## Notes

- `logWarn` is currently unused in source code (0 call sites outside tests), so the verbose suppression has no observable effect today. This is correct per design (infrastructure-first, callers add later) but worth noting.
- `runProposePipeline` also received the `events?` parameter for consistency. No caller passes it yet, which is fine.
