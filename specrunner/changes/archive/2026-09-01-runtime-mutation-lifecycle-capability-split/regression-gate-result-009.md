# Regression Gate Result — Iteration 9

## Summary

28 findings verified across all ledger entries. 26 are confirmed fixed; 2 remain present.

## Verified Fixed

| Ref | Severity | Finding |
|-----|----------|---------|
| `8b83c284` | MEDIUM | spec.md now has the `snapshotMainCheckoutGuard` exception clause at line 110 |
| `e78bf761` | LOW | tasks.md T-09 now explicitly notes "only a single `?.` is needed" |
| `593fb7ec` | LOW | tasks.md T-06 now says "Per D5, helpers MUST be defined alongside the capability interface — NOT in local.ts" |
| `b1e9a036` | HIGH | `RuntimeStrategy.buildDeps` returns `PipelineDeps` (not `unknown`) in port interface |
| `964864b9` | HIGH | `as PipelineDeps` cast removed from runner.ts:222 |
| `66311801` | MEDIUM | `RoundGitEffectsCapability` methods are now required (no `?`) |
| `e2856da5` | HIGH | Same as `b1e9a036` |
| `2ab85cb8` | HIGH | Same as `964864b9` |
| `2afc3a56` | HIGH | `_latestBuiltDeps` removed; replaced by `_currentConfig`/`_currentRequest`; `pushCapability` threaded via `CommitPushInfra` |
| `2676babe` | MEDIUM | Same as `66311801` |
| `f9cadb4a` | LOW | `runtimeStrategy: undefined` removed from listed test fixtures (iteration-display, pipeline-one-shot-resume, implementer-recovery) |
| `c759649a` | HIGH | Same as `964864b9` |
| `3cd30b91` | HIGH | Same as `b1e9a036` |
| `e44e50cc` | MEDIUM | TC-T15-05 now calls through `Pick<RuntimeStrategy, "buildDeps">` interface fake; no `as PipelineDeps` cast in test body |
| `15eeb57f` | LOW | Same as `f9cadb4a` |
| `0bbb2081` | HIGH | Both `buildDeps` return type and `as PipelineDeps` cast addressed |
| `f325fc3f` | MEDIUM | `architecture/components.md` line 175 now correctly states the interface declares `buildDeps(): PipelineDeps` |
| `42e2e998` | MEDIUM | TC-T15-05 title and comment updated to reflect no-cast, PipelineDeps-direct design |
| `6c02fc17` | MEDIUM | TC-T15-06 added with `vi.fn()` spy confirming `prepareStepArtifacts` fires before `runner.run()` |
| `0361ce52` | LOW | Stale `runtimeStrategy` comments in step-types.ts and no-op-detect.ts removed |
| `dfe5963e` | LOW | `makeTerminalStateSource` fake signature fixed: `(_cwd: string, _slug: string, _state: JobState)` |
| `8bfa5251` | LOW | Same as `dfe5963e` |
| `d99ce9e8` | LOW | `RecordFindingRecencyParams` stale `runtimeStrategy` field names removed |
| `efd2995e` | LOW | Parallel-review-round test local variables renamed away from `runtimeStrategy` |
| `8a31005a` | MEDIUM | No empty string passed; call sites guard with `if (deps.terminalState && deps.cwd)` |
| `290e6a63` | MEDIUM | `commitFinalState` adapter uses the passed `cwd` directly; not `LocalRuntime.cwd` |

## Remaining Findings (still present)

### [27] `eda3048d` — MEDIUM — Optional cwd causes terminal publication to be skipped
**File**: `src/core/pipeline/pipeline.ts:400` / `src/core/command/runner.ts:323`

Both pipeline terminal paths and the runner halt path use `if (deps.terminalState && deps.cwd)` which silently skips `commitFinalState` when `deps.cwd` is absent instead of applying the `deps.cwd ?? process.cwd()` fallback. The test at `tests/core/pipeline/pipeline.test.ts:758` ("omitted deps.cwd → commitFinalState is NOT called") explicitly locks in the skip behavior and its comment argues this is safe because buildDeps always sets cwd in production — but this codifies the absence of the process.cwd() fallback. The operator-required fallback is still not present.

**Evidence**: `pipeline.ts:400`: `if (deps.terminalState && deps.cwd)` — no fallback branch. `pipeline.test.ts:758`: `expect(commitFinalStateSpy).not.toHaveBeenCalled()` confirms the skip is locked in.

### [28] `5b1f4daf` — MEDIUM — Optional cwd causes terminal publication to be skipped (same condition)
**File**: `src/core/pipeline/pipeline.ts:400`

Same root cause as `eda3048d`. The `deps.cwd ?? process.cwd()` fallback is absent at both pipeline terminal paths and the runner halt path. Finding is still present.

## Evidence

- checked: 28
- skipped: 0
- unverified: 0
