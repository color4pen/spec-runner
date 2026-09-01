# Regression Gate Result — Iteration 003

**Change**: runtime-strategy-convergence  
**Date**: 2026-09-01  
**Findings Ledger**: 13 items  
**Regressions Found**: 0

## Evidence Summary

All 13 ledger findings were verified against the current branch. Each was confirmed fixed.

---

## Per-Finding Verification

### [1] `74c57ebf` — HIGH: Risk 節の reloadJobState 推論が事実と逆
**File**: specrunner/changes/runtime-strategy-convergence/design.md:181  
**Status**: FIXED  
**Evidence**: design.md line 181 now correctly states: "managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する。この throw は catch ブロックで捕捉され RELOAD_FAILED で job が失敗する。T-04 の変更はこの挙動に対して behavior-preserving である。なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。" The incorrect claim has been replaced with the correct explanation.

---

### [2] `a3f334e5` — MEDIUM: ratchet に canDeriveChangedFiles?. 禁止パターンが欠落
**File**: specrunner/changes/runtime-strategy-convergence/design.md:163  
**Status**: FIXED  
**Evidence**: design.md D7 item 6 now includes "`canDeriveChangedFiles?.` が 0 件" (line 170). The ratchet test file (runtime-strategy-ratchet.test.ts lines 197–203) contains a dedicated test: `describe("Ratchet: canDeriveChangedFiles?. が production src に存在しない", ...)` which scans `collectProductionFiles(SRC_DIR)` for the pattern.

---

### [3] `bf648013` — HIGH: Architecture ratchet REPO_ROOT has off-by-one
**File**: src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117  
**Status**: FIXED  
**Evidence**: Line 117 now reads: `const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");` — exactly 4 `..` segments. The comment above (line 116) says "4 levels up from __tests__: src/core/port/__tests__ → src/core/port → src/core → src → repo root". 4 levels up is correct. The 5th `..` that caused the off-by-one has been removed.

---

### [4] `3c2c274d` — MEDIUM: JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op
**File**: src/core/port/command-runtime.ts:50  
**Status**: FIXED  
**Evidence**: The JSDoc at lines 49–52 now reads: "- local: assertNoDuplicateLiveJob scans slug occupancy (throws SLUG_OCCUPIED on conflict). bootstrapJob creates in-memory JobState; persistence deferred to setupWorkspace. - managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local). bootstrapJob creates in-memory JobState." No longer claims managed is a no-op. The stale `assertProviderReadiness` comment in managed.ts line 627 also no longer says "No-op — mirrors assertNoDuplicateLiveJob convention"; it now correctly documents the no-op as a managed runtime design choice.

---

### [5] `9276fb21` — LOW: Stale JSDoc references removed concepts
**File**: src/core/runtime/managed.ts:607  
**Status**: FIXED  
**Evidence**: managed.ts lines 601–608 now read: "Managed runtime: reload not verified for this store topology. See separate request. fail-closed: throws to prevent pipeline start until managed runtime store safety is confirmed in a separate request (D3 / T-03 choice). reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." No mention of optional-chaining in runner.ts or RealRuntimeStrategy. provider-readiness.ts line 5 now reads: "Consumed by ProviderReadinessCapability (required) in command-runtime.ts and by core/runtime/provider-readiness.ts (classifier)." — no stale RealRuntimeStrategy reference.

---

### [6] `c13131e8` — LOW: Test fake still typed as RuntimeStrategy & PipelineDepsBuilder
**File**: tests/unit/core/command/runner.test.ts:94  
**Status**: FIXED  
**Evidence**: `buildMockRuntime()` at line 88–94 now returns `RuntimeFacade`. `TestCommand` constructor at line 139 accepts `RuntimeFacade`. Neither `RuntimeStrategy & PipelineDepsBuilder` nor the old intersection appear anywhere in the file.

---

### [7] `dfde0782` — MEDIUM: Stale JSDoc comment still references RuntimeStrategy & PipelineDepsBuilder
**File**: src/core/types.ts:166  
**Status**: FIXED  
**Evidence**: types.ts lines 164–166 now read: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)." The stale `RuntimeStrategy & PipelineDepsBuilder` reference has been removed.

---

### [8] `2312a149` — LOW: PipelineDepsBuilder JSDoc still references RuntimeStrategy & PipelineDepsBuilder for CommandRunner/factory.ts
**File**: src/core/types.ts:166  
**Status**: FIXED  
**Evidence**: Same as finding [7] — the JSDoc at lines 164–166 now references `RuntimeFacade` instead of `RuntimeStrategy & PipelineDepsBuilder`.

---

### [9] `57758a4f` — LOW: File-level JSDoc still says composition-root types use RuntimeStrategy & PipelineDepsBuilder
**File**: src/core/port/runtime-strategy.ts:24  
**Status**: FIXED  
**Evidence**: runtime-strategy.ts lines 21–24 now read: "T-18: buildDeps() has been moved to the domain-owned PipelineDepsBuilder interface (src/core/types.ts). This removes the ports→domain import that was required for the PipelineDeps return type. Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file." No longer references `RuntimeStrategy & PipelineDepsBuilder`.

---

### [10] `868d8ee7` — MEDIUM: TestCommand constructor still accepts RuntimeStrategy & PipelineDepsBuilder
**File**: tests/unit/core/runtime/runner-reload-egress-e2e.test.ts:294  
**Status**: FIXED  
**Evidence**: runner-reload-egress-e2e.test.ts line 295 now reads: `runtime: ProviderReadinessCapability & WorkspaceLifecycleCapability & JobStatePersistenceCapability & PipelineDepsBuilder`. runner-reload-after-setup.test.ts lines 192 and 198 also use the narrow contract type. `RuntimeStrategy & PipelineDepsBuilder` is absent from both files.

---

### [11] `50dac132` — MEDIUM: Ratchet TC-032 does not cover tests/unit/core/runtime/ directory
**File**: src/core/port/__tests__/runtime-strategy-ratchet.test.ts:229  
**Status**: FIXED  
**Evidence**: TC-032c (lines 248–257) now covers `tests/unit/core/runtime/`: `const runtimeTestDir = path.join(TESTS_DIR, "unit", "core", "runtime"); const files = (await collectTsFiles(runtimeTestDir)).filter((f) => f !== SELF_FILE); const hits = await findOccurrences(files, "RuntimeStrategy & PipelineDepsBuilder");`

---

### [12] `3630b474` — LOW: assertRuntimeSupportsScope uses Pick<ChangedFilesCapability>
**File**: src/core/pipeline/runtime-capability-gate.ts:71  
**Status**: FIXED  
**Evidence**: assertRuntimeSupportsScope parameter type at line 71 now reads `runtime: ChangedFilesCapability` (not `Pick<ChangedFilesCapability, 'canDeriveChangedFiles'>`). The full capability type is used directly.

---

### [13] `7884d0f9` — LOW: Test helper functions return Pick<RuntimeStrategy, 'canDeriveChangedFiles'>
**File**: tests/unit/core/pipeline/resolve-scope.test.ts:310  
**Status**: FIXED  
**Evidence**: `makeIncapableRuntime()` at line 310 now returns `ChangedFilesCapability` (with both `canDeriveChangedFiles` and `listChangedFiles` implemented). `makeCapableRuntime()` at line 317 also returns `ChangedFilesCapability`. No `Pick<RuntimeStrategy, ...>` references remain.

---

## Conclusion

All 13 ledger findings are fixed. No regressions detected.
