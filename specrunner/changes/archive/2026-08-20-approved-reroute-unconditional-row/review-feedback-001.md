# Code Review Feedback — iteration 001

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### 受け入れ基準

| # | 基準 | 結果 |
|---|------|------|
| 1 | TC-017 追加 + 4 点 pin green | ✅ |
| 2 | cleanTransition 探索から `fixerNamesForReroute` 除去、`t.when === undefined` + `t.to !== budgetSkippedFixer` + end/escalate 除外 | ✅ |
| 3 | T-03 発火判定 (`:462` `fixerNamesForReroute.has(nextStep)`) 無変更 | ✅ |
| 4 | `currentStep === exhaustedReviewer` ガード (`:472`) 無変更 | ✅ |
| 5 | fixer 入場前予算チェック (`:590-596`) 無変更 | ✅ |
| 6 | 既存 TC-001/TC-014/TC-016 無改変 green | ✅ |
| 7 | `bun run typecheck` / `bun run test` green | ✅ |

### cleanTransition 探索の置換（pipeline.ts:478-486）

旧条件 `!fixerNamesForReroute.has(t.to as string)` と `(!t.when || t.when(state))` が除去されている。
新条件は要求仕様の 5 条件と一致:

```ts
t.step === currentStep &&
t.on === "approved" &&
t.to !== budgetSkippedFixer &&
t.to !== "end" &&
t.to !== "escalate" &&
t.when === undefined
```

`fixerNamesForReroute` の構築 (`:458`) と発火判定 (`:462`) は無変更を確認。

### TC-017 再現テスト

- `loopFixerPairs: { "spec-review": "spec-fixer", "verification": "implementer" }` + `maxIterations: 2` — 本番構成を再現
- `TEST_SLUG = "approved-reroute-unconditional-row"` + `request.slug = TEST_SLUG` → `getJobSlug(state)` が正しいスラッグを返す
- `SPEC_MD_PATH = specrunner/changes/${TEST_SLUG}/spec.md` は `protectedCanonPaths` + `writableByFixer["spec-fixer"]` の両方に含まれる → `specReviewHasRoutableFixables = true` を確認（`canon-write-scope.ts`, `write-scope.ts` 参照）
- spec-review 3 回目 approved + fixable → guarded 行 `spec-review → spec-fixer` が選択される
- T-03 発火: `fixerIter("spec-fixer") = 2 >= effectiveMax = 2`、cleanTransition = `{ step: "spec-review", on: "approved", to: "implementer", when: undefined }`
- T-03 後の implementer 入場前: `getFixerIter("implementer") = 0 < 2` → 予算チェック通過
- 4 点 pin 全確認:
  1. `result.status === "awaiting-archive"` + `SPEC_REVIEW_RETRIES_EXHAUSTED` なし
  2. `budgetSkippedEvents[0].step === "spec-review"`, `.fixer === "spec-fixer"`
  3. warning history に `"proceeding to"` 文言
  4. `implementerCallCount >= 1`

### バイパスロジックとの干渉確認

spec-fixer iter 2 完了後 spec-review に再入する際の `review-exhausted` チェック:
`iteration = 2`, `bypassIteration = 2 >= effectiveMax = 2` → bypass (`:664`) → 通過し spec-review 3 回目が実行される。TC-017 シナリオが成立することを `convergence-budget.ts` と `pipeline.ts:657-666` で確認。

### テスト実行結果

```
Tests  29 passed | 1 skipped (30)
```

TC-014 は main 時点から `.it.skip` 済み（本 branch の変更なし）。本 branch の差分は TC-017 追加と `specReviewHasRoutableFixables` import 追加のみ。

## 検証できなかった項目

TC-004（破壊確認）— cleanTransition を旧条件に戻した場合に TC-017 が red になることの実機確認。
TC-017 のコメントに DESTRUCTION CONFIRMATION として再現手順が記載されており、
verification-result.md の test green でカバー（修正後 green が確認されている）。

## Findings 詳細

None。全受け入れ基準を満たしている。
