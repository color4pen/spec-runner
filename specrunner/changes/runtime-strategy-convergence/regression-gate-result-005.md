# Regression Gate Result — Iteration 005

**Date**: 2026-09-02  
**Branch**: refactor/runtime-strategy-convergence-b0074b66  
**Ledger size**: 19 findings

## Summary

All 19 ledger findings have been verified as **fixed** in the current code. No regressions detected.

## Finding-by-Finding Verification

### [1] `74c57ebf` — design.md Risk 節の reloadJobState 推論修正
- **File**: `specrunner/changes/runtime-strategy-convergence/design.md:181`
- **Status**: ✅ FIXED
- **Evidence**: Line 181 now correctly states "managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する" and "なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。" The inversion is acknowledged and corrected.

### [2] `a3f334e5` — ratchet に canDeriveChangedFiles\?\. 禁止パターン追加
- **File**: `specrunner/changes/runtime-strategy-convergence/design.md:163`
- **Status**: ✅ FIXED
- **Evidence**: D7 item 6 now lists `canDeriveChangedFiles?.` as a production-banned pattern. The ratchet test at `runtime-strategy-ratchet.test.ts:197-203` enforces this with a dedicated `describe` block.

### [3] `bf648013` — REPO_ROOT の off-by-one 修正
- **File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117`
- **Status**: ✅ FIXED
- **Evidence**: Line 117 now uses exactly 4 `..` segments: `path.resolve(import.meta.dirname, "..", "..", "..", "..")` with comment "Repo root is 4 levels up from __tests__: src/core/port/__tests__ → src/core/port → src/core → src → repo root". Files are now scanned correctly.

### [4] `3c2c274d` — JobBootstrapCapability JSDoc 修正
- **File**: `src/core/port/command-runtime.ts:50`
- **Status**: ✅ FIXED
- **Evidence**: Line 51 now reads "managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." The stale "no-op" description is removed. managed.ts line 626 stale comment is also replaced with an accurate description of the no-op assertProviderReadiness.

### [5] `9276fb21` — managed.ts 607 の stale JSDoc 修正
- **File**: `src/core/runtime/managed.ts:607`
- **Status**: ✅ FIXED
- **Evidence**: Lines 601-608 now read "reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." No reference to optional chaining in runner.ts or RealRuntimeStrategy. provider-readiness.ts line 5 also updated ("Consumed by ProviderReadinessCapability (required)").

### [6] `c13131e8` — runner.test.ts fake を RuntimeFacade に更新
- **File**: `tests/unit/core/command/runner.test.ts:94`
- **Status**: ✅ FIXED
- **Evidence**: `buildMockRuntime` now returns `RuntimeFacade`. `TestCommand` constructor takes `runtime: RuntimeFacade`. No `RuntimeStrategy & PipelineDepsBuilder` intersection.

### [7] `dfde0782` — types.ts JSDoc の RuntimeStrategy & PipelineDepsBuilder 参照修正
- **File**: `src/core/types.ts:166`
- **Status**: ✅ FIXED
- **Evidence**: Line 165-166 now reads "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)." The stale intersection type reference is removed.

### [8] `2312a149` — types.ts PipelineDepsBuilder JSDoc 修正（Finding 7 と同一箇所）
- **File**: `src/core/types.ts:166`
- **Status**: ✅ FIXED
- **Evidence**: Same fix as Finding [7]. The comment now references RuntimeFacade, not `RuntimeStrategy & PipelineDepsBuilder`.

### [9] `57758a4f` — runtime-strategy.ts file-level JSDoc 修正
- **File**: `src/core/port/runtime-strategy.ts:24`
- **Status**: ✅ FIXED
- **Evidence**: Lines 22-24 now read "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file." No reference to `RuntimeStrategy & PipelineDepsBuilder`.

### [10] `868d8ee7` — runner-reload-egress-e2e.test.ts TestCommand 型更新
- **File**: `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts:294`
- **Status**: ✅ FIXED
- **Evidence**: `TestCommand` now takes `runtime: ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`. Same in `runner-reload-after-setup.test.ts:192, 198`. No `RuntimeStrategy & PipelineDepsBuilder`.

### [11] `50dac132` — TC-032 に tests/unit/core/runtime/ カバレッジ追加
- **File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:229`
- **Status**: ✅ FIXED
- **Evidence**: TC-032c at lines 248-256 covers `tests/unit/core/runtime/` directory for `RuntimeStrategy & PipelineDepsBuilder` occurrences.

### [12] `3630b474` — assertRuntimeSupportsScope 型を ChangedFilesCapability に変更
- **File**: `src/core/pipeline/runtime-capability-gate.ts:71`
- **Status**: ✅ FIXED
- **Evidence**: Line 71 now uses `runtime: ChangedFilesCapability` directly instead of `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>`.

### [13] `7884d0f9` — resolve-scope.test.ts helper 型を ChangedFilesCapability に変更
- **File**: `tests/unit/core/pipeline/resolve-scope.test.ts:310`
- **Status**: ✅ FIXED
- **Evidence**: `makeIncapableRuntime()` and `makeCapableRuntime()` now return `ChangedFilesCapability` directly. No `Pick<RuntimeStrategy, ...>`.

### [14] `fb43706d` — unpushable-path-contract.test.ts の修飾 import 形式 as unknown as RuntimeStrategy 除去
- **File**: `tests/unit/step/unpushable-path-contract.test.ts:403`
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy` cast found in the file (only a comment at line 382 saying "no cast to RuntimeStrategy needed"). `as unknown as RuntimeStrategy` and `as never` patterns are gone. `makePipelineDeps` uses `StepIoValidationCapability` stub.

### [15] `39e34e9c` — executor-input-validation.test.ts のモノリシック fake 除去
- **File**: `tests/unit/step/executor-input-validation.test.ts:88`
- **Status**: ✅ FIXED
- **Evidence**: Line 89 now defines `makeFailingValidationStrategy(errorToThrow: Error): StepIoValidationCapability` with only the 3 required methods. No `RuntimeStrategy & PipelineDepsBuilder` intersection.

### [16] `adfd236f` — managed-runtime-capabilities.test.ts の不要 ?. 除去
- **File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`
- **Status**: ✅ FIXED
- **Evidence**: Line 290 now reads `deps.changedFiles?.canDeriveChangedFiles()` — single optional chain on the optional field, no double `?.` on the required method.

### [17] `fb1f1c44` — unpushable-path-contract.test.ts の修飾 import cast 除去（Finding 14 と同一）
- **File**: `tests/unit/step/unpushable-path-contract.test.ts:403`
- **Status**: ✅ FIXED
- **Evidence**: Same as Finding [14]. No `as unknown as import(...)RuntimeStrategy` or `strategy as never` patterns present.

### [18] `bb562fd0` — managed-runtime-capabilities.test.ts の二重 ?. 除去（Finding 16 と同一）
- **File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`
- **Status**: ✅ FIXED
- **Evidence**: Same as Finding [16]. `canDeriveChangedFiles?.()` is now `canDeriveChangedFiles()`.

### [19] `ec2aa9e0` — TC-032 の step-layer テストカバレッジ追加
- **File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:228`
- **Status**: ✅ FIXED
- **Evidence**: TC-032d at lines 263-268 now covers `tests/unit/step/` for `RuntimeStrategy & PipelineDepsBuilder`. Step-layer ratchet gap is closed.

## Evidence Summary

- **Checked**: 19 findings verified against current code
- **Regressions**: 0
- **Contradictions**: 0
- **Skipped**: 0
