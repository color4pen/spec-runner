# Regression Gate Result — Iteration 002

## Summary

All 6 findings from Iteration 1 have been verified as fixed. No regressions detected.

## Evidence

### Finding 1: T-09 — doctor-cli.test.ts vi.mock 削除範囲の明確化

**Status: Fixed**

`tests/core/doctor/doctor-cli.test.ts` lines 18–22:
```js
vi.mock("../../../src/core/doctor/checks/index.js", () => ({
  commonChecks: [],
  managedChecks: [],
  localChecks: [],
}));
```
`allChecks: []` の 1 行のみ削除済み。vi.mock ブロック自体と `commonChecks`/`managedChecks`/`localChecks` は残存。`tasks.md:130` に「allChecks: [], の **1 行のみ**を削除する」と明確化済み。

---

### Finding 2: T-09 — next-steps.test.ts の stale コメント修正

**Status: Fixed**

`tests/unit/doctor/next-steps.test.ts` lines 13–14:
```ts
// deriveNextSteps is exported from src/core/doctor/next-steps.ts (new module) or re-exported from index.ts
// Tries index.ts first (re-export), falls back to next-steps.ts directly
```
旧 stale コメント「Module does not exist yet — dynamic import defers the failure to test execution (RED until implementation)」は削除され、実態を反映した記述に更新済み。`tasks.md:131` にも修正指示が追記済み。

---

### Finding 3: T-05 — `from.*state/store` コメント参照 (managed.ts:121)

**Status: Fixed**

`src/core/runtime/managed.ts` lines 119–121:
```ts
/**
 * Update job state atomically: load → mutate → persist.
 */
```
旧コメント「Replaces the deprecated updateJobState() from state/store.ts.」は削除済み。`grep "from state/store" src/ tests/` でマッチなし（ドキュメントファイルのみ）。

---

### Finding 4: T-05 — `from.*state/store` コメント参照 (finish-job-state.test.ts:71)

**Status: Fixed**

`tests/finish-job-state.test.ts` line 71:
```ts
/** Helper: load job state from disk */
```
旧コメント「/** Helper replacing the removed loadJobState(id) from state/store.ts */」は削除済み。grep で `from state/store` がテストファイルに残存しないことを確認。

---

### Finding 5: stale JSDoc — 'The const below co-exists with the interface'

**Status: Fixed**

`src/core/doctor/types.ts` lines 82–86:
```ts
/**
 * DoctorContext: injectable dependencies for all doctor checks.
 * Unit tests provide a mock; production code provides real implementations.
 *
 */
export interface DoctorContext {
```
「The const below co-exists with the interface in separate declaration spaces...」という旧 JSDoc は削除済み。`export const DoctorContext: undefined = undefined` の削除と整合している。

---

### Finding 6: stale inline comment — 'list and resolve remain'

**Status: Fixed**

`tests/unit/generate-chain-removed.test.ts` line 164:
```ts
// "create" function should be removed; "list" remains
```
旧コメント「"create" function should be removed; "list" and "resolve" remain」から「and "resolve"」が削除済み。`resolve` が `src/core/request/manager.ts` から削除されたことと整合している。

---

## Verdict

No regressions. All 6 findings remain fixed.
