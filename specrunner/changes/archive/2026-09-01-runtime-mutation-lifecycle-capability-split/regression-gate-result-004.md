# Regression Gate Result — Iteration 4

## Summary

18 ledger findings verified. 1 regression remains open.

## Evidence

| # | Ref | Severity | File | Status |
|---|-----|----------|------|--------|
| 1 | `8b83c284` | MEDIUM | spec.md:108 | ✅ Fixed — Exception sentence added at line 110 |
| 2 | `e78bf761` | LOW | tasks.md:204 | ✅ Fixed — T-09 now says single `?.` only |
| 3 | `593fb7ec` | LOW | tasks.md:139 | ✅ Fixed — T-06 now explicitly says "per D5, defined in step-capability.ts / pipeline-capability.ts" |
| 4 | `b1e9a036` | HIGH | runtime-strategy.ts:394 | ✅ Fixed — `buildDeps` now returns `PipelineDeps` |
| 5 | `964864b9` | HIGH | runner.ts:222 | ✅ Fixed — `as PipelineDeps` cast removed; direct typed assignment |
| 6 | `66311801` | MEDIUM | pipeline-capability.ts:92 | ✅ Fixed — `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` are now required |
| 7 | `e2856da5` | HIGH | runtime-strategy.ts:394 | ✅ Fixed — same as finding 4 |
| 8 | `2ab85cb8` | HIGH | runner.ts:222 | ✅ Fixed — same as finding 5 |
| 9 | `2afc3a56` | HIGH | local.ts:161 | ✅ Fixed — `_latestBuiltDeps` removed; replaced by `_currentConfig` / `_currentRequest`; `pushCapability` added to `CommitPushInfra` |
| 10 | `2676babe` | MEDIUM | pipeline-capability.ts:92 | ✅ Fixed — same as finding 6 |
| 11 | `f9cadb4a` | LOW | iteration-display.test.ts:102 | ✅ Fixed — no `runtimeStrategy: undefined` entries found in test fixtures |
| 12 | `c759649a` | HIGH | runner.ts:222 | ✅ Fixed — same as finding 5 |
| 13 | `3cd30b91` | HIGH | runtime-strategy.ts:21 | ✅ Fixed — same as finding 4 |
| 14 | `e44e50cc` | MEDIUM | executor-lifecycle-ordering.test.ts:260 | ✅ Resolved — test now calls through `Pick<RuntimeStrategy, "buildDeps">`, exercising the actual port interface. Since the port now returns `PipelineDeps`, the stated invariant holds. Description/comments are stale but the test is no longer misleading reviewers about TC-022 compliance (TC-022 is now actually passing). |
| 15 | `15eeb57f` | LOW | iteration-display.test.ts:102 | ✅ Fixed — same as finding 11 |
| 16 | `0bbb2081` | HIGH | runtime-strategy.ts:388 | ✅ Fixed — same as findings 4/5 |
| 17 | `f325fc3f` | MEDIUM | components.md:175 | ✅ Fixed — architecture doc updated at line 175; now correctly states the interface itself declares `buildDeps(): PipelineDeps` |
| 18 | `8a31005a` | MEDIUM | pipeline.ts:399 | ❌ REGRESSION — still present |

## Regression Detail

### Finding 18 — `deps.cwd ?? ""` fallback violates StepContext contract

`src/core/port/step-context.ts` documents (lines 14/19-20):

```
* cwd is optional; when absent, consumers SHALL fall back to process.cwd().
cwd?: string;
```

`pipeline.ts` passes `deps.cwd ?? ""` (empty string) at both terminal-publish call sites:

- Line 399 (awaiting-archive): `deps.terminalState?.commitFinalState(deps.cwd ?? "", ...)`
- Line 623 (awaiting-resume / guard halt): `deps.terminalState?.commitFinalState(deps.cwd ?? "", ...)`

An empty string is an invalid cwd — git operations with `cwd: ""` will either error or silently use the process's inherited cwd in an unpredictable way. The documented fallback is `process.cwd()`. Both call sites must be changed to `deps.cwd ?? process.cwd()`.

## Checked Files

- `src/core/port/runtime-strategy.ts` — buildDeps return type
- `src/core/command/runner.ts` — as PipelineDeps cast
- `src/core/pipeline/pipeline-capability.ts` — RoundGitEffectsCapability method optionality
- `src/core/runtime/local.ts` — _latestBuiltDeps removal, pushCapability threading
- `src/core/step/commit-push.ts` — CommitPushInfra.pushCapability field
- `src/core/types.ts` — PipelineDeps.runtimeStrategy removal, capability fields
- `src/core/port/step-context.ts` — cwd contract
- `src/core/pipeline/pipeline.ts` — commitFinalState call sites (cwd fallback)
- `architecture/components.md` — architecture doc accuracy
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/spec.md` — required-methods exception
- `specrunner/changes/runtime-mutation-lifecycle-capability-split/tasks.md` — T-06, T-09
- `tests/unit/step/executor-lifecycle-ordering.test.ts` — TC-T15-05
- `src/core/pipeline/__tests__/iteration-display.test.ts` — stale runtimeStrategy fixtures
- `src/core/pipeline/__tests__/pipeline-one-shot-resume.test.ts` — stale runtimeStrategy fixtures
- `tests/unit/absorb-build-fixer/implementer-recovery.test.ts` — stale runtimeStrategy fixtures
