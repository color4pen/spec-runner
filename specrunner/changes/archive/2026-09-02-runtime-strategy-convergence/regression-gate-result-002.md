# Regression Gate Result — Iteration 002

**Change**: runtime-strategy-convergence  
**Date**: 2026-09-01  
**Branch**: refactor/runtime-strategy-convergence-b0074b66

---

## Summary

All 9 findings from the ledger were verified. No regressions detected.

---

## Finding-by-Finding Verification

### [1] `74c57ebf` — Risk 節の reloadJobState 推論が事実と逆 [HIGH]

**File**: `specrunner/changes/runtime-strategy-convergence/design.md:181`

**Status**: ✅ FIXED

design.md line 181 now correctly states: "managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する" and explicitly acknowledges "なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。" The incorrect claim is gone.

---

### [2] `a3f334e5` — ratchet に canDeriveChangedFiles\?\. 禁止パターンが欠落 [MEDIUM]

**File**: `specrunner/changes/runtime-strategy-convergence/design.md:163`

**Status**: ✅ FIXED

`src/core/port/__tests__/runtime-strategy-ratchet.test.ts` lines 197–203 now contain a dedicated ratchet test: `Ratchet: canDeriveChangedFiles?. が production src に存在しない` that guards `canDeriveChangedFiles?.` in production files (excluding `__tests__`). The ratchet test comment at line 6 of the file also lists this as pattern #6.

---

### [3] `bf648013` — Architecture ratchet REPO_ROOT has off-by-one [HIGH]

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117`

**Status**: ✅ FIXED

Line 117 now uses 4 `..` segments: `path.resolve(import.meta.dirname, "..", "..", "..", "..")`. The comment above (line 116) correctly explains "Repo root is 4 levels up from `__tests__`: src/core/port/__tests__ → src/core/port → src/core → src → repo root". SRC_DIR and TESTS_DIR now resolve to real directories and ratchet assertions scan actual files.

---

### [4] `3c2c274d` — JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op [MEDIUM]

**File**: `src/core/port/command-runtime.ts:50`

**Status**: ✅ FIXED

The JSDoc at lines 43–53 now correctly states: `- managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local).` The stale "no-op" claim has been removed. The stale comment in managed.ts line 627 has also been corrected — it now says "No-op: managed readiness is handled by existing preflight / session creation" (referring to `assertProviderReadiness`, not `assertNoDuplicateLiveJob`).

---

### [5] `9276fb21` — Stale JSDoc references removed concepts in managed.ts [LOW]

**File**: `src/core/runtime/managed.ts:607`

**Status**: ✅ FIXED

Lines 601–608 in managed.ts no longer reference "optional-chaining call in runner.ts uses `?.`" or "RealRuntimeStrategy requires it". The JSDoc now reads: "reloadJobState is required on JobStatePersistenceCapability; the safest production behavior for managed runtime is to throw rather than silently skip." Additionally, `src/core/port/provider-readiness.ts` line 5 no longer says "required on RealRuntimeStrategy" — it now says "Consumed by ProviderReadinessCapability (required) in command-runtime.ts".

---

### [6] `c13131e8` — Test fake still typed as RuntimeStrategy & PipelineDepsBuilder [LOW]

**File**: `tests/unit/core/command/runner.test.ts:94`

**Status**: ✅ FIXED

Line 94: `buildMockRuntime` now returns `RuntimeFacade` (not `RuntimeStrategy & PipelineDepsBuilder`). Line 139: `TestCommand` constructor takes `runtime: RuntimeFacade`. Both type annotations are updated.

---

### [7] `dfde0782` — Stale JSDoc comment still references `RuntimeStrategy & PipelineDepsBuilder` [MEDIUM]

**File**: `src/core/types.ts:166`

**Status**: ✅ FIXED

Lines 165–166 in types.ts now say: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface (see src/core/port/runtime-strategy.ts)." The stale reference to `RuntimeStrategy & PipelineDepsBuilder` is gone.

---

### [8] `2312a149` — PipelineDepsBuilder JSDoc still references RuntimeStrategy & PipelineDepsBuilder [LOW]

**File**: `src/core/types.ts:166`

**Status**: ✅ FIXED

Same location as finding [7]. The JSDoc is now correctly updated as described above.

---

### [9] `57758a4f` — File-level JSDoc still says composition-root types use RuntimeStrategy & PipelineDepsBuilder [LOW]

**File**: `src/core/port/runtime-strategy.ts:24`

**Status**: ✅ FIXED

Lines 23–24 in runtime-strategy.ts now say: "Composition-root types (CommandRunner, factory.ts) use the unified RuntimeFacade interface defined in this file." The stale intersection type reference is removed.

---

## Evidence

- Files checked: 9 (per ledger findings)
- Regressions found: 0
- Findings still present: 0
