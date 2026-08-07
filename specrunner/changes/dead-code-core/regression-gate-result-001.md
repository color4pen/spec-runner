# Regression Gate Result — dead-code-core iteration 1

## Summary

6 findings checked. 2 confirmed fixed. 4 regressions (never applied).

---

## Verified Fixed

### Finding 1 — T-09: doctor-cli.test.ts vi.mock 削除範囲の明確化

**Status**: FIXED

`tasks.md:130` updated to `allChecks: [],` の **1 行のみ**を削除する（vi.mock ブロック自体は残す）。
`tests/core/doctor/doctor-cli.test.ts` の diff でも `allChecks: []` 1 行のみが削除され、
`commonChecks: []`・`managedChecks: []`・`localChecks: []` は残存している。
意図と実装が一致している。

### Finding 2 — T-09: next-steps.test.ts stale コメント修正

**Status**: FIXED

`tasks.md:131` にコメント書き換えタスクが追加された。
`tests/unit/doctor/next-steps.test.ts` の diff で line 14 が
`// Module does not exist yet — dynamic import defers the failure to test execution (RED until implementation)`
→ `// Tries index.ts first (re-export), falls back to next-steps.ts directly`
に書き換えられていることを確認。

---

## Regressions (not fixed)

### Finding 3 — T-05 `from.*state/store` コメント残存（managed.ts）

**Status**: NOT FIXED — regression

`src/core/runtime/managed.ts:121` の JSDoc:
```
Replaces the deprecated updateJobState() from state/store.ts.
```
が `from.*state/store` パターンにマッチしたまま残存している。
T-05 の受け入れ基準「`from.*state/store` が src/ tests/ で grep 0 件」を満たしていない。

修正: `Replaces the deprecated updateJobState() from state/store.ts.` →
`Update job state atomically: load → mutate → persist.` など state/store.ts への言及を除いた表現に変更。

### Finding 4 — T-05 `from.*state/store` コメント残存（finish-job-state.test.ts）

**Status**: NOT FIXED — regression

`tests/finish-job-state.test.ts:71` の JSDoc:
```
/** Helper replacing the removed loadJobState(id) from state/store.ts */
```
が `from.*state/store` パターンにマッチしたまま残存している。
T-05 の受け入れ基準「`from.*state/store` が src/ tests/ で grep 0 件」を満たしていない。

修正: `from state/store.ts` の言及を除いた表現に変更（例: `/** Local helper to load job state by id */`）。

### Finding 5 — stale JSDoc in doctor/types.ts

**Status**: NOT FIXED — regression

`src/core/doctor/types.ts:86–88` の JSDoc:
```
 * The const below co-exists with the interface in separate declaration spaces,
 * providing a runtime-accessible export so dynamic import destructuring works.
 * @internal
```
が const 削除後も残存している。diff では `export const DoctorContext: undefined = undefined` の削除のみで
JSDoc の該当行は無修正のまま。

修正: JSDoc の最後 3 行（const co-exists ～ @internal）を削除する。

### Finding 6 — stale inline comment in generate-chain-removed.test.ts

**Status**: NOT FIXED — regression

`tests/unit/generate-chain-removed.test.ts:164` のコメント:
```
// "create" function should be removed; "list" and "resolve" remain
```
`resolve` は `src/core/request/manager.ts` から削除済みのため `"resolve" remain` が事実と乖離している。

修正: コメントを `// "create" function should be removed; "list" remains` に変更。

---

## Evidence

- git diff main...HEAD で全変更を確認
- grep `from.*state/store` → 2 件残存（managed.ts:121, finish-job-state.test.ts:71）
- grep `The const below co-exists with the interface` → src/core/doctor/types.ts:86 に残存
- grep `list.*resolve remain` → tests/unit/generate-chain-removed.test.ts:164 に残存
- src/core/request/manager.ts を読み取り → `resolve` 関数は削除済み（list のみ残存）を確認
