# Regression Gate Result — Iteration 008

**Date**: 2026-09-02  
**Branch**: refactor/runtime-strategy-convergence-b0074b66  
**Findings Ledger**: 24 items checked

---

## Evidence Summary

All 24 findings from the ledger were verified against the current code.

---

## Finding-by-Finding Verification

### [1] HIGH — design.md Risk 節の reloadJobState 推論
- **File**: specrunner/changes/runtime-strategy-convergence/design.md:181
- **Status**: ✅ FIXED
- **Evidence**: design.md:181 now correctly states "なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった" and accurately describes the managed new-run throw path.

### [2] MEDIUM — ratchet に canDeriveChangedFiles?. 禁止パターンが欠落
- **File**: specrunner/changes/runtime-strategy-convergence/design.md:163
- **Status**: ✅ FIXED
- **Evidence**: runtime-strategy-ratchet.test.ts lines 205–211 now include the `canDeriveChangedFiles?.` ratchet test ("Ratchet: canDeriveChangedFiles?. が production src に存在しない"). The ratchet calls `collectProductionFiles(SRC_DIR)` and guards against the pattern.

### [3] HIGH — Architecture ratchet REPO_ROOT off-by-one (5 `..` → 0 files scanned)
- **File**: src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117
- **Status**: ✅ FIXED
- **Evidence**: Line 117 now uses 4 `..` segments: `path.resolve(import.meta.dirname, "..", "..", "..", "..")` — correct 4-level ascent from `src/core/port/__tests__` to repo root.

### [4] MEDIUM — JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op
- **File**: src/core/port/command-runtime.ts:50
- **Status**: ✅ FIXED
- **Evidence**: command-runtime.ts:51 now reads "managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." The stale "No-op — mirrors assertNoDuplicateLiveJob convention" comment in managed.ts is also corrected.

### [5] LOW — Stale JSDoc referencing removed concepts: optional chaining / RealRuntimeStrategy
- **File**: src/core/runtime/managed.ts:607
- **Status**: ✅ FIXED
- **Evidence**: managed.ts:601–608 now reads "reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." No references to optional chaining in runner.ts or RealRuntimeStrategy. provider-readiness.ts:5 no longer mentions RealRuntimeStrategy.

### [6] LOW — Test fake still typed as RuntimeStrategy & PipelineDepsBuilder
- **File**: tests/unit/core/command/runner.test.ts:94
- **Status**: ✅ FIXED
- **Evidence**: runner.test.ts:94 buildMockRuntime() now returns `RuntimeFacade` (not `RuntimeStrategy & PipelineDepsBuilder`). TestCommand at line 139 accepts `RuntimeFacade`.

### [7] MEDIUM — Stale JSDoc comment still references `RuntimeStrategy & PipelineDepsBuilder`
- **File**: src/core/types.ts:166
- **Status**: ✅ FIXED
- **Evidence**: types.ts:165–166 now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)."

### [8] LOW — PipelineDepsBuilder JSDoc references old intersection type
- **File**: src/core/types.ts:166
- **Status**: ✅ FIXED
- **Evidence**: Same fix as [7] — JSDoc updated to reference RuntimeFacade.

### [9] LOW — runtime-strategy.ts:24 file-level JSDoc stale
- **File**: src/core/port/runtime-strategy.ts:24
- **Status**: ✅ FIXED
- **Evidence**: runtime-strategy.ts:23–24 now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file."

### [10] MEDIUM — TestCommand in runner-reload-egress-e2e.test.ts uses old whole-port type
- **File**: tests/unit/core/runtime/runner-reload-egress-e2e.test.ts:294
- **Status**: ✅ FIXED
- **Evidence**: TestCommand constructor at line 295 now accepts `ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder` — the narrow required contract.

### [11] MEDIUM — TC-032 does not cover tests/unit/core/runtime/
- **File**: src/core/port/__tests__/runtime-strategy-ratchet.test.ts:229
- **Status**: ✅ FIXED
- **Evidence**: TC-032c (lines 256–264) now guards `tests/unit/core/runtime/` for `RuntimeStrategy & PipelineDepsBuilder`.

### [12] LOW — assertRuntimeSupportsScope uses Pick<ChangedFilesCapability> instead of full type
- **File**: src/core/pipeline/runtime-capability-gate.ts:71
- **Status**: ❌ STILL PRESENT
- **Evidence**: runtime-capability-gate.ts:75 still reads `runtime: Pick<ChangedFilesCapability, "canDeriveChangedFiles">`. ChangedFilesCapability is narrow (2 methods: canDeriveChangedFiles + listChangedFiles); accepting the full type directly is both safe and consistent with the design principle. TC-011 ratchet does not catch this because it only guards `Pick<RuntimeStrategy`.

### [13] LOW — Test helper functions return Pick<RuntimeStrategy, 'canDeriveChangedFiles'>
- **File**: tests/unit/core/pipeline/resolve-scope.test.ts:310
- **Status**: ✅ FIXED
- **Evidence**: resolve-scope.test.ts:310–321 now uses `ChangedFilesCapability` as return type for makeIncapableRuntime() and makeCapableRuntime().

### [14] MEDIUM — Qualified import form `as unknown as RuntimeStrategy` bypasses TC-012
- **File**: tests/unit/step/unpushable-path-contract.test.ts:403
- **Status**: ✅ FIXED
- **Evidence**: No occurrences of `as unknown as RuntimeStrategy`, `as unknown as import(`, or `as never` found in unpushable-path-contract.test.ts.

### [15] LOW — step-layer テストが RuntimeStrategy & PipelineDepsBuilder モノリシック fake を継続使用
- **File**: tests/unit/step/executor-input-validation.test.ts:88
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` occurrences in tests/unit/step/. TC-032d (lines 270–278) now guards that directory.

### [16] LOW — canDeriveChangedFiles?. double optional chaining in test
- **File**: src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290
- **Status**: ✅ FIXED
- **Evidence**: managed-runtime-capabilities.test.ts:290 now reads `deps.changedFiles?.canDeriveChangedFiles()` (single `?.` on the outer optional field; inner `?.` removed).

### [17] MEDIUM — Qualified import as unknown as RuntimeStrategy bypasses TC-012 (duplicate of 14)
- **File**: tests/unit/step/unpushable-path-contract.test.ts:403
- **Status**: ✅ FIXED
- **Evidence**: Same verification as [14] — pattern not present. TC-012b also added to ratchet (lines 192–197) to guard `as any as RuntimeStrategy`.

### [18] LOW — required method canDeriveChangedFiles has unnecessary ?.  (duplicate of 16)
- **File**: src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290
- **Status**: ✅ FIXED
- **Evidence**: Same verification as [16].

### [19] LOW — TC-032 does not cover step-layer tests (duplicate of 15)
- **File**: src/core/port/__tests__/runtime-strategy-ratchet.test.ts:228
- **Status**: ✅ FIXED
- **Evidence**: TC-032d (lines 270–278) now guards tests/unit/step/.

### [20] HIGH — RuntimeStrategy & PipelineDepsBuilder in tests/unit/core/step/ outside ratchet scope
- **File**: tests/unit/core/step/executor-cli-entry-oid.test.ts:83
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` occurrences in tests/unit/core/step/. TC-032e (lines 284–292) now guards that directory.

### [21] MEDIUM — RuntimeStrategy & PipelineDepsBuilder in tests/attach/ (known ratchet gap)
- **File**: tests/attach/attach-resume-e2e.test.ts:154
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` occurrences in tests/attach/. TC-032f (lines 297–305) now guards that directory.

### [22] LOW — CommandRunner JSDoc missing Step 0 (assertProviderReadiness)
- **File**: src/core/command/runner.ts:9
- **Status**: ✅ FIXED
- **Evidence**: runner.ts:8 now includes "0. assertProviderReadiness() — before prepare(); readiness failures have no side effects" in the execution sequence JSDoc. Error handling section also updated at line 19.

### [23] MEDIUM — TC-012 misses `as any as RuntimeStrategy` pattern
- **File**: src/core/port/__tests__/runtime-strategy-ratchet.test.ts:187
- **Status**: ✅ FIXED
- **Evidence**: TC-012b (lines 192–197) added to guard `as any as RuntimeStrategy`. pipeline-sole-committer-round-guard.test.ts no longer contains this pattern (verified: no matches found).

### [24] LOW — Comment says RuntimeFacade defined in factory.ts
- **File**: src/core/port/command-runtime.ts:15
- **Status**: ✅ FIXED
- **Evidence**: command-runtime.ts:15 now reads "is defined in src/core/runtime-facade.ts".

---

## Summary

| Severity | Total | Fixed | Regression |
|----------|-------|-------|------------|
| HIGH     | 3     | 3     | 0          |
| MEDIUM   | 8     | 8     | 0          |
| LOW      | 13    | 12    | 1          |
| **TOTAL**| **24**| **23**| **1**      |

### Regressions (1)

- **[12] LOW** `src/core/pipeline/runtime-capability-gate.ts:75` — `assertRuntimeSupportsScope` parameter type remains `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` instead of the full `ChangedFilesCapability`.
