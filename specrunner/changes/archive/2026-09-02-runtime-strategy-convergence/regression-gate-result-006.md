# Regression Gate Result — Iteration 006

**Date**: 2026-09-02  
**Branch**: refactor/runtime-strategy-convergence-b0074b66  
**Ledger size**: 22 findings (19 carried from iter-005, 3 new: [20][21][22])

## Summary

21 of 22 ledger findings remain **fixed**. One regression detected.

**Regression**: Finding [12] (`3630b474`) — `assertRuntimeSupportsScope` parameter type reverted from `ChangedFilesCapability` to `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` by the iter-006 code-fixer (commit `99a242ff`). The fix was confirmed present at commit `7ec7376c` (iter-005 code-fixer) and correctly verified by the iter-005 regression gate.

## Finding-by-Finding Verification

### [1] `74c57ebf` — design.md Risk 節の reloadJobState 推論修正
- **File**: `specrunner/changes/runtime-strategy-convergence/design.md:181`
- **Status**: ✅ FIXED
- **Evidence**: Line 181 correctly states "managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する" and acknowledges the prior inversion ("なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。"). No regression.

### [2] `a3f334e5` — ratchet に canDeriveChangedFiles\?\. 禁止パターン追加
- **File**: `specrunner/changes/runtime-strategy-convergence/design.md:163`
- **Status**: ✅ FIXED
- **Evidence**: `runtime-strategy-ratchet.test.ts:197-203` contains a dedicated `describe` block enforcing `canDeriveChangedFiles?.` at 0 occurrences in production source. No regression.

### [3] `bf648013` — REPO_ROOT の off-by-one 修正
- **File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117`
- **Status**: ✅ FIXED
- **Evidence**: Line 117: `path.resolve(import.meta.dirname, "..", "..", "..", "..")` uses exactly 4 `..` segments. Comment confirms "4 levels up from __tests__: src/core/port/__tests__ → src/core/port → src/core → src → repo root". SRC_DIR and TESTS_DIR correctly point to repo-root/src and repo-root/tests. No regression.

### [4] `3c2c274d` — JobBootstrapCapability JSDoc 修正
- **File**: `src/core/port/command-runtime.ts:50`
- **Status**: ✅ FIXED
- **Evidence**: Line 51 reads "managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local)." Stale "no-op" description removed. managed.ts line 626 comment accurately describes no-op assertProviderReadiness. No regression.

### [5] `9276fb21` — managed.ts 607 の stale JSDoc 修正
- **File**: `src/core/runtime/managed.ts:607`
- **Status**: ✅ FIXED
- **Evidence**: Lines 601-608 say "reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." No reference to optional-chaining in runner.ts or RealRuntimeStrategy. No regression.

### [6] `c13131e8` — runner.test.ts fake を RuntimeFacade に更新
- **File**: `tests/unit/core/command/runner.test.ts:94`
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` in runner.test.ts. No regression.

### [7] `dfde0782` — types.ts JSDoc の RuntimeStrategy & PipelineDepsBuilder 参照修正
- **File**: `src/core/types.ts:166`
- **Status**: ✅ FIXED
- **Evidence**: Lines 165-166 read "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)." No stale intersection type reference. No regression.

### [8] `2312a149` — types.ts PipelineDepsBuilder JSDoc 修正（Finding 7 と同一箇所）
- **File**: `src/core/types.ts:166`
- **Status**: ✅ FIXED
- **Evidence**: Same as Finding [7]. No regression.

### [9] `57758a4f` — runtime-strategy.ts file-level JSDoc 修正
- **File**: `src/core/port/runtime-strategy.ts:24`
- **Status**: ✅ FIXED
- **Evidence**: Lines 22-24: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file." No reference to `RuntimeStrategy & PipelineDepsBuilder`. No regression.

### [10] `868d8ee7` — runner-reload-egress-e2e.test.ts TestCommand 型更新
- **File**: `tests/unit/core/runtime/runner-reload-egress-e2e.test.ts:294`
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` in runner-reload-egress-e2e.test.ts or runner-reload-after-setup.test.ts. No regression.

### [11] `50dac132` — TC-032 に tests/unit/core/runtime/ カバレッジ追加
- **File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:229`
- **Status**: ✅ FIXED
- **Evidence**: TC-032c at lines 248-256 covers `tests/unit/core/runtime/` directory. No regression.

### [12] `3630b474` — assertRuntimeSupportsScope 型を ChangedFilesCapability に変更
- **File**: `src/core/pipeline/runtime-capability-gate.ts:71`
- **Status**: ❌ REGRESSED
- **Evidence**: Current code at line 75 uses `runtime: Pick<ChangedFilesCapability, "canDeriveChangedFiles">` instead of `ChangedFilesCapability`. The fix was confirmed present at commit `7ec7376c` (iter-005 code-fixer), verified by the iter-005 regression gate ("Line 71 now uses `runtime: ChangedFilesCapability` directly"). The iter-006 code-fixer commit `99a242ff` reverted the parameter type back to `Pick<ChangedFilesCapability, "canDeriveChangedFiles">` while restructuring the JSDoc. The JSDoc even justifies this ("The parameter type is narrowed to only the predicate the gate actually consults"), but this contradicts the design principle that Pick-based extraction should not be used when the full capability type is narrow enough to accept directly.

### [13] `7884d0f9` — resolve-scope.test.ts helper 型を ChangedFilesCapability に変更
- **File**: `tests/unit/core/pipeline/resolve-scope.test.ts:310`
- **Status**: ✅ FIXED
- **Evidence**: `makeIncapableRuntime()` at line 310 returns `ChangedFilesCapability` with both required methods. `makeCapableRuntime()` at line 317 similarly. No `Pick<RuntimeStrategy, ...>`. No regression.

### [14] `fb43706d` — unpushable-path-contract.test.ts の修飾 import 形式 cast 除去
- **File**: `tests/unit/step/unpushable-path-contract.test.ts:403`
- **Status**: ✅ FIXED
- **Evidence**: No `as unknown as` cast involving `RuntimeStrategy` (qualified or bare) in the file. Only a comment at line 382 referencing RuntimeStrategy. No `as never` re-cast. No regression.

### [15] `39e34e9c` — executor-input-validation.test.ts のモノリシック fake 除去
- **File**: `tests/unit/step/executor-input-validation.test.ts:88`
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` in executor-input-validation.test.ts. TC-032d ratchet now covers this directory. No regression.

### [16] `adfd236f` — managed-runtime-capabilities.test.ts の不要 ?. 除去
- **File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`
- **Status**: ✅ FIXED
- **Evidence**: Line 290 reads `deps.changedFiles?.canDeriveChangedFiles()` — single optional chain on the optional field `changedFiles`, direct call on the required method `canDeriveChangedFiles`. No double `?.`. No regression.

### [17] `fb1f1c44` — unpushable-path-contract.test.ts の修飾 import cast 除去（Finding 14 と同一）
- **File**: `tests/unit/step/unpushable-path-contract.test.ts:403`
- **Status**: ✅ FIXED
- **Evidence**: Same as Finding [14]. No regression.

### [18] `bb562fd0` — managed-runtime-capabilities.test.ts の二重 ?. 除去（Finding 16 と同一）
- **File**: `src/core/runtime/__tests__/managed-runtime-capabilities.test.ts:290`
- **Status**: ✅ FIXED
- **Evidence**: Same as Finding [16]. No regression.

### [19] `ec2aa9e0` — TC-032 の step-layer テストカバレッジ追加
- **File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:228`
- **Status**: ✅ FIXED
- **Evidence**: TC-032d at lines 262-270 covers `tests/unit/step/` for `RuntimeStrategy & PipelineDepsBuilder`. No regression.

### [20] `64d3a5b3` — tests/unit/core/step/ のモノリシック fake 除去 + TC-032e ratchet 追加（NEW）
- **File**: `tests/unit/core/step/executor-cli-entry-oid.test.ts:83`
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` in executor-cli-entry-oid.test.ts or verification-phase-outcome-executor.test.ts. TC-032e at lines 276-284 now covers `tests/unit/core/step/`. No regression.

### [21] `e3c7d9fb` — tests/attach/ のモノリシック fake 除去 + TC-032f ratchet 追加（NEW）
- **File**: `tests/attach/attach-resume-e2e.test.ts:154`
- **Status**: ✅ FIXED
- **Evidence**: No `RuntimeStrategy & PipelineDepsBuilder` in attach-resume-e2e.test.ts. TC-032f at lines 286-297 now covers `tests/attach/`. No regression.

### [22] `d7765b54` — CommandRunner JSDoc に Step 0 (assertProviderReadiness) 追加（NEW）
- **File**: `src/core/command/runner.ts:9`
- **Status**: ✅ FIXED
- **Evidence**: Lines 7-16: "Execution sequence:" now starts with "0. assertProviderReadiness() — before prepare(); readiness failures have no side effects". Error handling section at lines 17-23 includes "assertProviderReadiness() failure → return 1 (no job state created)". No regression.

## Evidence Summary

- **Checked**: 22 findings verified against current code
- **Regressions**: 1 (Finding [12] `3630b474`)
- **Contradictions**: 0
- **Skipped**: 0
