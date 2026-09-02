# Regression Gate Result — Iteration 007

**Change**: runtime-strategy-convergence  
**Date**: 2026-09-02  
**Ledger items checked**: 22  
**Regressions found**: 0

---

## Verification Summary

All 22 ledger findings were verified against the current branch. Every item has been resolved.

### [1] `74c57ebf` — design.md Risk section corrected
**Status: FIXED**  
`design.md:181` now correctly states that managed new run has `reloadJobState` implemented (throws) and `existingWorktreePath === undefined` is true, meaning throws can occur. The note "従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった" is present.

### [2] `a3f334e5` — ratchet `canDeriveChangedFiles?.` pattern added
**Status: FIXED**  
`runtime-strategy-ratchet.test.ts:193-201` contains a dedicated ratchet block checking that `canDeriveChangedFiles?.` is absent from production source files.

### [3] `bf648013` — REPO_ROOT off-by-one fixed
**Status: FIXED**  
`runtime-strategy-ratchet.test.ts:117` now uses `path.resolve(import.meta.dirname, "..", "..", "..", "..")` — exactly 4 `..` segments, correctly reaching the repo root from `src/core/port/__tests__/`.

### [4] `3c2c274d` — JSDoc for managed `assertNoDuplicateLiveJob` corrected
**Status: FIXED**  
`command-runtime.ts:50-51` now reads: "managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." The incorrect "no-op" description is gone.

### [5] `9276fb21` — Stale JSDoc in managed.ts and provider-readiness.ts updated
**Status: FIXED**  
`managed.ts:601-607` now says "reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." No references to optional chaining or RealRuntimeStrategy.  
`provider-readiness.ts:5` now says "Consumed by ProviderReadinessCapability (required) in command-runtime.ts" — no reference to RealRuntimeStrategy.

### [6] `c13131e8` — runner.test.ts fake typed as RuntimeFacade
**Status: FIXED**  
`runner.test.ts:94` function `buildMockRuntime` returns `RuntimeFacade` instead of `RuntimeStrategy & PipelineDepsBuilder`.

### [7] `dfde0782` — types.ts JSDoc updated to RuntimeFacade
**Status: FIXED**  
`types.ts:165-166` JSDoc now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)."

### [8] `2312a149` — Same as [7]
**Status: FIXED** (same fix as finding [7] — same location, same text).

### [9] `57758a4f` — runtime-strategy.ts file-level JSDoc updated
**Status: FIXED**  
`runtime-strategy.ts:22-24` now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file."

### [10] `868d8ee7` — TestCommand in runner-reload-egress-e2e.test.ts uses narrow contract
**Status: FIXED**  
`runner-reload-egress-e2e.test.ts:295` now uses `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`.  
`runner-reload-after-setup.test.ts:198` also uses the same narrow intersection.

### [11] `50dac132` — TC-032c added for tests/unit/core/runtime/
**Status: FIXED**  
`runtime-strategy-ratchet.test.ts:248-256` contains TC-032c scanning `tests/unit/core/runtime/` for `RuntimeStrategy & PipelineDepsBuilder`.

### [12] `3630b474` — assertRuntimeSupportsScope takes ChangedFilesCapability
**Status: FIXED**  
`runtime-capability-gate.ts:71` now declares `runtime: ChangedFilesCapability` (not `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>`).

### [13] `7884d0f9` — resolve-scope.test.ts helpers return ChangedFilesCapability
**Status: FIXED**  
`resolve-scope.test.ts:310,317` now declare `makeIncapableRuntime(): ChangedFilesCapability` and `makeCapableRuntime(): ChangedFilesCapability`.

### [14] `fb43706d` — `as unknown as import(...)RuntimeStrategy` removed
**Status: FIXED**  
No `as unknown as.*RuntimeStrategy` pattern found in `unpushable-path-contract.test.ts`. The `as never` recasts are also gone.

### [15] `39e34e9c` — step-layer tests covered by TC-032d
**Status: FIXED**  
TC-032d (`runtime-strategy-ratchet.test.ts:262-270`) now guards `tests/unit/step/` against `RuntimeStrategy & PipelineDepsBuilder`. Confirmed `executor-input-validation.test.ts` has no such pattern.

### [16] `adfd236f` — double optional chaining fixed in managed-runtime-capabilities.test.ts
**Status: FIXED**  
`managed-runtime-capabilities.test.ts:290` now reads `deps.changedFiles?.canDeriveChangedFiles()` (outer `?.` retained for optional field, inner `?.` removed).

### [17] `fb1f1c44` — Same as [14]
**Status: FIXED** (same file, same fix).

### [18] `bb562fd0` — Same as [16]
**Status: FIXED** (same file, same fix).

### [19] `ec2aa9e0` — TC-032d added for tests/unit/step/
**Status: FIXED** (same fix as [15]).

### [20] `64d3a5b3` — TC-032e added for tests/unit/core/step/
**Status: FIXED**  
TC-032e (`runtime-strategy-ratchet.test.ts:276-284`) now guards `tests/unit/core/step/`. Confirmed `executor-cli-entry-oid.test.ts` and `verification-phase-outcome-executor.test.ts` contain no `RuntimeStrategy & PipelineDepsBuilder`.

### [21] `e3c7d9fb` — TC-032f added for tests/attach/
**Status: FIXED**  
TC-032f (`runtime-strategy-ratchet.test.ts:289-297`) now guards `tests/attach/`. Confirmed `attach-resume-e2e.test.ts` contains no `RuntimeStrategy & PipelineDepsBuilder`.

### [22] `d7765b54` — CommandRunner JSDoc includes Step 0
**Status: FIXED**  
`runner.ts:8` execution sequence starts with "0. assertProviderReadiness() — before prepare(); readiness failures have no side effects". Error handling section also documents the provider readiness failure path.

---

## Conclusion

No regressions detected. All 22 ledger findings are resolved in the current branch state.
