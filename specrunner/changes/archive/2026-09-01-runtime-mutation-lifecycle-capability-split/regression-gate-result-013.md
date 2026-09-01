# Regression Gate Result — Iteration 13

**Branch**: refactor/runtime-mutation-lifecycle-capability-split-71d6a83e  
**Date**: 2026-08-31  
**Ledger entries checked**: 31

## Summary

All 31 findings from the ledger have been verified as **fixed** in the current code. No regressions detected.

## Finding-by-Finding Verification

### [1] `8b83c284` — spec.md exception clause for snapshotMainCheckoutGuard
**Status: FIXED**  
`spec.md` line 110 now includes an explicit `**Exception**` clause: "StepArtifactLifecycleCapability.snapshotMainCheckoutGuard SHALL be the sole optional method." This resolves the contradiction with TC-004 and tasks.md T-02.

### [2] `e78bf761` — T-09 double ?. on verifyFindingRefs
**Status: FIXED**  
`tasks.md` line 204 now reads: "use the `stepIo` capability field. Note: only a single `?.` is needed because `verifyFindingRefs` is a required method on `StepIoValidationCapability` (no second `?.` on the method itself)." The clarification aligns with D6.

### [3] `593fb7ec` — T-06 derive helper file placement
**Status: FIXED**  
`tasks.md` line 139 now explicitly states: "Per D5, helpers MUST be defined alongside the capability interface in the same consumer-domain file — NOT in `local.ts`."

### [4] `b1e9a036` — buildDeps returns unknown in port interface
**Status: FIXED**  
`src/core/port/runtime-strategy.ts` line 400 now declares `): PipelineDeps;` (with `import type { PipelineDeps }` at line 36). No `unknown` remains.

### [5] `964864b9` — as PipelineDeps cast in runner.ts:222
**Status: FIXED**  
`src/core/command/runner.ts` line 222 now reads `deps = this.runtime.buildDeps(config, request, slug, workspace);` — no cast.

### [6] `66311801` — RoundGitEffectsCapability optional methods
**Status: FIXED**  
`src/core/pipeline/pipeline-capability.ts` lines 95, 111, 128 now declare `listWorktreeChanges`, `commitRoundArtifacts`, `digestArtifacts` as required (no `?` modifier). JSDoc comments document D6 compliance.

### [7] `e2856da5` — Duplicate of [4]
**Status: FIXED** (same fix as [4])

### [8] `2ab85cb8` — Duplicate of [5]
**Status: FIXED** (same fix as [5])

### [9] `2afc3a56` — _latestBuiltDeps side-channel and CommitPushInfra.pushCapability
**Status: FIXED**  
`src/core/runtime/local.ts` comment at line 155 documents "R2b: _latestBuiltDeps is replaced by these two stable fields." `src/core/step/commit-push.ts` line 95 declares `pushCapability?: PushCapability | null` on `CommitPushInfra`.

### [10] `2676babe` — Duplicate of [6]
**Status: FIXED** (same fix as [6])

### [11] `f9cadb4a` — Stale runtimeStrategy: undefined in test fixtures
**Status: FIXED**  
`grep -rn "runtimeStrategy: undefined"` across all affected test files returns no results. The stale property has been removed.

### [12] `c759649a` — Duplicate of [5]
**Status: FIXED** (same fix as [5])

### [13] `3cd30b91` — Duplicate of [4]
**Status: FIXED** (same fix as [4])

### [14] `e44e50cc` — TC-T15-05 does not prove compile-time invariant via port interface
**Status: FIXED**  
`tests/unit/step/executor-lifecycle-ordering.test.ts` lines 343–353 now create `const fake: Pick<RuntimeStrategy, "buildDeps">` and call `fake.buildDeps(...)` — the result is used without any cast, proving the port interface returns `PipelineDeps` directly.

### [15] `15eeb57f` — Duplicate of [11]
**Status: FIXED** (same fix as [11])

### [16] `0bbb2081` — Duplicate of [4] and [5]
**Status: FIXED** (same fixes)

### [17] `f325fc3f` — architecture doc incorrectly describes interface return type
**Status: FIXED**  
`architecture/components.md` line 175 now states: "呼び出し側の `runner.ts` は `as PipelineDeps` キャスト不要でそのまま受け取れる（T-05/T-12）。" The description accurately reflects the implemented interface.

### [18] `42e2e998` — TC-T15-05 title contradicts TC-021/TC-022
**Status: FIXED**  
The test title now reads "RuntimeStrategy.buildDeps() returns PipelineDeps directly; no cast needed in domain code (DSM §3 via allowlist)" and the comment block explains the allowlist approach correctly.

### [19] `6c02fc17` — TC-008 prepareStepArtifacts ordering not pinned by spy
**Status: FIXED**  
`tests/unit/step/executor-lifecycle-ordering.test.ts` lines 222–282 add TC-T15-06: a `vi.fn()` spy captures call order, and `expect(callOrder[0]).toBe("prepareStepArtifacts")` pins the ordering before `runner.run()`.

### [20] `0361ce52` — Stale runtimeStrategy in step-types.ts and no-op-detect.ts comments
**Status: FIXED**  
`grep -n "runtimeStrategy" src/core/step/no-op-detect.ts src/core/port/step-types.ts` returns no results.

### [21] `dfe5963e` — makeTerminalStateSource wrong commitFinalState signature (local test)
**Status: FIXED**  
`src/core/runtime/__tests__/local-runtime-capabilities.test.ts` line 43 now declares `async commitFinalState(_cwd: string, _slug: string, _state: JobState): Promise<void> {}`.

### [22] `8bfa5251` — Duplicate of [21] (managed test)
**Status: FIXED**  
Same fix applied to both local and managed test files.

### [23] `d99ce9e8` — Stale runtimeStrategy field name in RecordFindingRecencyParams
**Status: FIXED**  
`grep -n "runtimeStrategy" src/core/step/finding-recency.ts` returns no results. Field has been renamed.

### [24] `efd2995e` — Stale local variables named runtimeStrategy in invalidation tests
**Status: FIXED**  
`grep -n "runtimeStrategy" src/core/pipeline/__tests__/parallel-review-round-invalidation.test.ts` returns no results.

### [25] `b0910a21` — as never forced casts on roundGitEffects field
**Status: FIXED**  
`makeRuntimeStrategy()` in `parallel-review-round-git-effects.test.ts` now returns an object passed directly as `roundGitEffects: runtimeStrategy` (no `as never` cast). The helper is correctly typed and excludes `finalizeStepArtifacts`.

### [26] `a039a195` — StepExecutor/CommitOrchestrator collaborator lists cite RuntimeStrategy
**Status: FIXED**  
`architecture/components.md` line 67 now lists "StepArtifactLifecycleCapability（artifact finalize）/ StepIoValidationCapability（output gate）" and line 73 lists "RoundGitEffectsCapability（git seam）".

### [27] `c1117b7c` — components.md lines 60/66 reference validateStepInputs/Outputs via RuntimeStrategy
**Status: FIXED**  
`architecture/components.md` line 60 now references "StepIoValidationCapability.validateStepInputs（`deps.stepIo` 経由）" and "StepIoValidationCapability.validateStepOutputs".

### [28] `8a31005a` — Terminal publication breaks documented cwd fallback in pipeline.ts
**Status: FIXED**  
`src/core/pipeline/pipeline.ts` lines 400 and 625 now use `deps.cwd ?? process.cwd()` as the cwd argument to `commitFinalState`.

### [29] `290e6a63` — Terminal publication uses LocalRuntime.cwd instead of process.cwd() fallback
**Status: FIXED**  
`src/core/runtime/local.ts` `commitFinalState(cwd: string, ...)` now takes the cwd from the caller (pipeline.ts) which already applies the `?? process.cwd()` fallback.

### [30] `eda3048d` — Optional cwd causes terminal publication to be skipped
**Status: FIXED**  
All three call sites (end path, halt path in pipeline.ts, halt path in runner.ts) now use `deps.cwd ?? process.cwd()`.

### [31] `5b1f4daf` — Duplicate of [30]
**Status: FIXED** (same fix as [30])

## Evidence

- Checked: 31 findings
- Regressions found: 0
- All acceptance criteria related to the ledger entries are met in the current code.
