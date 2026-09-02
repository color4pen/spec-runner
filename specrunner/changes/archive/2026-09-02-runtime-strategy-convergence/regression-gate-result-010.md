# Regression Gate Result — Iteration 010

**Branch**: refactor/runtime-strategy-convergence-b0074b66  
**Date**: 2026-09-02  
**Ledger items**: 26

## Summary

All 26 ledger findings have been verified. No regressions detected.

## Findings Verification

### [1] `74c57ebf` — design.md Risk 節の reloadJobState 推論が事実と逆
**Status: FIXED**  
`design.md` line 181 now correctly states that managed new run hits the throw path and explicitly notes "従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。"

### [2] `a3f334e5` — ratchet に canDeriveChangedFiles?. 禁止パターンが欠落
**Status: FIXED**  
`runtime-strategy-ratchet.test.ts` lines 205–210 add a dedicated `Ratchet: canDeriveChangedFiles?. が production src に存在しない` suite that searches production files for the `canDeriveChangedFiles?.` pattern.

### [3] `bf648013` — REPO_ROOT has off-by-one (5 `..` instead of 4)
**Status: FIXED**  
Line 117: `path.resolve(import.meta.dirname, "..", "..", "..", "..")` — exactly 4 `..` segments, matching the comment "4 levels up". `SRC_DIR` and `TESTS_DIR` now resolve correctly.

### [4] `3c2c274d` — JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op
**Status: FIXED**  
`command-runtime.ts` line 51 now reads "- managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." — no longer claims no-op.

### [5] `9276fb21` — Stale JSDoc references removed concepts in managed.ts
**Status: FIXED**  
`managed.ts` lines 604–607 no longer reference optional-chaining in runner.ts or RealRuntimeStrategy. `provider-readiness.ts` contains no "required on RealRuntimeStrategy" text.

### [6] `c13131e8` — Test fake in runner.test.ts typed as RuntimeStrategy & PipelineDepsBuilder
**Status: FIXED**  
`tests/unit/core/command/runner.test.ts` line 94 now returns `RuntimeFacade`; line 139 accepts `RuntimeFacade`. No occurrence of `RuntimeStrategy & PipelineDepsBuilder`.

### [7] `dfde0782` — Stale JSDoc in types.ts references RuntimeStrategy & PipelineDepsBuilder
**Status: FIXED**  
`src/core/types.ts` line 165–166 now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface".

### [8] `2312a149` — PipelineDepsBuilder JSDoc stale (duplicate of [7])
**Status: FIXED**  
Same location — corrected to reference RuntimeFacade.

### [9] `57758a4f` — runtime-strategy.ts file-level JSDoc stale
**Status: FIXED**  
Lines 22–24 now say "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file."

### [10] `868d8ee7` — TestCommand in runner-reload-egress-e2e.test.ts uses whole-port type
**Status: FIXED**  
Line 295 now accepts `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`. No `RuntimeStrategy & PipelineDepsBuilder`.

### [11] `50dac132` — TC-032 does not cover tests/unit/core/runtime/
**Status: FIXED**  
TC-035c (lines 256–264) explicitly guards `tests/unit/core/runtime/` for `RuntimeStrategy & PipelineDepsBuilder`.

### [12] `3630b474` — assertRuntimeSupportsScope uses Pick<ChangedFilesCapability>
**Status: FIXED**  
`runtime-capability-gate.ts` line 74 parameter is now `ChangedFilesCapability` directly.

### [13] `7884d0f9` — Test helpers return Pick<RuntimeStrategy, 'canDeriveChangedFiles'>
**Status: FIXED**  
`resolve-scope.test.ts` lines 310, 317: `makeIncapableRuntime()` and `makeCapableRuntime()` now return `ChangedFilesCapability`.

### [14] `fb43706d` — Qualified `as unknown as import(...)RuntimeStrategy` bypasses TC-012
**Status: FIXED**  
`unpushable-path-contract.test.ts` has no `as unknown as RuntimeStrategy` (qualified or unqualified) or `as never` capability re-cast.

### [15] `39e34e9c` — step-layer tests use monolithic fake (TC-035d gap)
**Status: FIXED**  
TC-035d guards `tests/unit/step/`; `executor-input-validation.test.ts` has no `RuntimeStrategy & PipelineDepsBuilder`.

### [16] `adfd236f` — Double optional chaining canDeriveChangedFiles?. in managed test
**Status: FIXED**  
`managed-runtime-capabilities.test.ts` line 290: `deps.changedFiles?.canDeriveChangedFiles()` — inner `?.` removed.

### [17] `fb1f1c44` — Qualified cast pattern duplicate of [14]
**Status: FIXED**  
Same as [14] — confirmed absent.

### [18] `bb562fd0` — Duplicate of [16]
**Status: FIXED**  
Same as [16] — confirmed absent.

### [19] `ec2aa9e0` — TC-032 step-layer gap (tests/unit/step/ uncovered)
**Status: FIXED**  
TC-035d now covers `tests/unit/step/`.

### [20] `64d3a5b3` — tests/unit/core/step/ monolithic fake (TC-035e gap)
**Status: FIXED**  
TC-035e guards `tests/unit/core/step/`; `executor-cli-entry-oid.test.ts` and `verification-phase-outcome-executor.test.ts` have no `RuntimeStrategy & PipelineDepsBuilder`.

### [21] `e3c7d9fb` — tests/attach/ monolithic fake (known ratchet gap)
**Status: FIXED**  
TC-035f guards `tests/attach/`; `attach-resume-e2e.test.ts` has no `RuntimeStrategy & PipelineDepsBuilder`.

### [22] `d7765b54` — runner.ts Execution sequence JSDoc missing Step 0
**Status: FIXED**  
Lines 7–8: "Execution sequence: 0. assertProviderReadiness() — before prepare(); readiness failures have no side effects". Error handling also lists assertProviderReadiness failure path.

### [23] `70bd6bc9` — TC-012 misses `as any as RuntimeStrategy` pattern
**Status: FIXED**  
TC-012b (lines 191–197) explicitly tests for `as any as RuntimeStrategy`. `pipeline-sole-committer-round-guard.test.ts` function `makeRuntimeStrategyMock` now returns `RoundGitEffectsCapability`, not a RuntimeStrategy cast.

### [24] `6f18b58e` — Comment says RuntimeFacade is in factory.ts
**Status: FIXED**  
`command-runtime.ts` lines 14–16 now state "RuntimeFacade ... is defined in src/core/runtime-facade.ts".

### [25] `df1ed004` — TC-032 label collision with test-cases.md
**Status: FIXED**  
The ratchet block is now numbered TC-035 (line 236 `describe("TC-035: ..."`). No TC-032 label collision remains.

### [26] `322e1864` — Root-level tests/ files not guarded for RuntimeStrategy & PipelineDepsBuilder
**Status: FIXED**  
TC-035h (lines 326–347) explicitly lists root-level `tests/*.ts` files and asserts 0 occurrences of `RuntimeStrategy & PipelineDepsBuilder`.

## Evidence

- **checked**: 26
- **skipped**: 0
- **unverified**: 0
