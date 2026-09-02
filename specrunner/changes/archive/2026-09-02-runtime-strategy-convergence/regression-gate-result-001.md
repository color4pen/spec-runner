# Regression Gate Result — runtime-strategy-convergence / Iteration 1

## Summary

All 9 ledger findings have been verified. No regressions detected.

---

## Evidence

### [1] `74c57ebf` — Risk 節の reloadJobState 推論が事実と逆

**File**: `specrunner/changes/runtime-strategy-convergence/design.md:181`
**Status**: FIXED

design.md line 181 now correctly states:
- managed 新規 run では `reloadJobState` が実装済み（throw する）かつ `existingWorktreePath === undefined` が true になるため、現行コードでは既に throw が発生する経路が存在する
- 「なお従来の Risk 節の根拠「resume path では呼ばれない」は逆であり誤りだった。」

The Risk section now accurately reflects the behavior and acknowledges the prior incorrect reasoning.

---

### [2] `a3f334e5` — ratchet に canDeriveChangedFiles\?\. 禁止パターンが欠落

**File**: `specrunner/changes/runtime-strategy-convergence/design.md:163`
**Status**: FIXED

design.md D7 item 6 now includes:
> `src/` 配下の production ファイル（`__tests__/` 除外）に `canDeriveChangedFiles?.` が 0 件（TypeScript 型システムは外側 `?.` により内側 `?.` を型エラーにしないため、ratchet で明示的に禁止する必要がある）

The ratchet test `src/core/port/__tests__/runtime-strategy-ratchet.test.ts` lines 192-196 implements the check:
```ts
describe("Ratchet: canDeriveChangedFiles?. が production src に存在しない", () => {
  it("Ratchet: `canDeriveChangedFiles?.` が production src に 0 件", async () => {
    const files = await collectProductionFiles(SRC_DIR);
    const hits = await findOccurrences(files, "canDeriveChangedFiles?.");
    expect(hits, ...).toHaveLength(0);
  });
```

---

### [3] `bf648013` — Architecture ratchet REPO_ROOT has off-by-one

**File**: `src/core/port/__tests__/runtime-strategy-ratchet.test.ts:117`
**Status**: FIXED

Line 117 now reads:
```ts
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..", "..", "..");
```
4 `..` segments — correct for `src/core/port/__tests__` → `src/core/port` → `src/core` → `src` → repo root. The comment at line 116 confirms "4 levels up". SRC_DIR and TESTS_DIR now resolve to real directories and all ratchet assertions scan actual files.

---

### [4] `3c2c274d` — JobBootstrapCapability JSDoc says managed assertNoDuplicateLiveJob is no-op

**File**: `src/core/port/command-runtime.ts:50`
**Status**: FIXED

The JSDoc now reads:
> - managed: assertNoDuplicateLiveJob also delegates to assertSlugUnoccupied (same guard as local).

This accurately reflects `managed.ts:617-620` where `assertNoDuplicateLiveJob` calls `assertSlugUnoccupied`. The stale "no-op" comment is gone.

---

### [5] `9276fb21` — Stale JSDoc references removed concepts: optional chaining in runner.ts and RealRuntimeStrategy

**File**: `src/core/runtime/managed.ts:607`
**Status**: FIXED

Lines 601-611 now read:
```
/**
 * Managed runtime: reload not verified for this store topology. See separate request.
 *
 * fail-closed: throws to prevent pipeline start until managed runtime store safety
 * is confirmed in a separate request (D3 / T-03 choice).
 * reloadJobState is required on JobStatePersistenceCapability; the safest production
 * behavior for managed runtime is to throw rather than silently skip.
 */
```
No reference to optional chaining or RealRuntimeStrategy.

`src/core/port/provider-readiness.ts` line 5 now reads:
> Consumed by ProviderReadinessCapability (required) in command-runtime.ts

No reference to RealRuntimeStrategy.

---

### [6] `c13131e8` — Test fake still typed as RuntimeStrategy & PipelineDepsBuilder

**File**: `tests/unit/core/command/runner.test.ts:94`
**Status**: FIXED

- Line 94: `buildMockRuntime(...)` return type is `RuntimeFacade`
- Line 148: `TestCommand` constructor parameter is `runtime: RuntimeFacade`

Both occurrences now use `RuntimeFacade`.

---

### [7] `dfde0782` — Stale JSDoc comment still references `RuntimeStrategy & PipelineDepsBuilder`

**File**: `src/core/types.ts:166`
**Status**: FIXED

Lines 165-166 now read:
> Concrete runtimes (LocalRuntime, ManagedRuntime) implement this alongside RuntimeStrategy. Composition-root types (CommandRunner, factory.ts) use the **unified RuntimeFacade interface** (see src/core/port/runtime-strategy.ts).

The stale reference to `RuntimeStrategy & PipelineDepsBuilder` has been replaced with `RuntimeFacade`.

---

### [8] `2312a149` — PipelineDepsBuilder JSDoc still references RuntimeStrategy & PipelineDepsBuilder for CommandRunner/factory.ts

**File**: `src/core/types.ts:166`
**Status**: FIXED

Same location as finding [7]. The JSDoc at lines 165-166 now correctly references `RuntimeFacade`.

---

### [9] `57758a4f` — File-level JSDoc still says composition-root types use RuntimeStrategy & PipelineDepsBuilder

**File**: `src/core/port/runtime-strategy.ts:24`
**Status**: FIXED

Lines 22-24 now read:
> T-18: buildDeps() has been moved to the domain-owned PipelineDepsBuilder interface (src/core/types.ts). This removes the ports→domain import that was required for the PipelineDeps return type. Composition-root types (CommandRunner, factory.ts) use the **unified RuntimeFacade interface defined in this file**.

The stale `RuntimeStrategy & PipelineDepsBuilder` reference has been replaced with `RuntimeFacade`.

---

## Conclusion

**Checked**: 9 / 9 ledger items  
**Regressions**: 0  
**Skipped**: 0  
**Unverified**: 0
