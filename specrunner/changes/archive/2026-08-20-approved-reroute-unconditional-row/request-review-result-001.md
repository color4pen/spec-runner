# Request Review Result

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
     decision-needed の finding がある場合は escalation（needs-discussion）として扱われる。
-->

## 検証した項目

### コードアサーション照合

| アサーション | 確認結果 |
|-------------|---------|
| `types.ts:258` — `{ step: SPEC_REVIEW, on: "approved", to: SPEC_FIXER, when: specReviewHasRoutableFixables }` | ✓ line 258 一致 |
| `types.ts:260` — `{ step: SPEC_REVIEW, on: "approved", to: IMPLEMENTER }` | ✓ line 260 一致 |
| `types.ts:190-194` — LOOP_ERROR_CODES SPEC_REVIEW_RETRIES_EXHAUSTED | ✓ line 190–194 一致 |
| `pipeline.ts:452-502` — T-03 ブロック | ✓ 452–502 に存在 |
| `pipeline.ts:453` — `fixerNamesForReroute = new Set(Object.values(this.loopFixerPairs))` | ✓ line 453 一致 |
| `pipeline.ts:457` — `fixerNamesForReroute.has(nextStep)` (発火判定) | ✓ line 457 一致 |
| `pipeline.ts:467` — `currentStep === exhaustedReviewer` ガード | ✓ line 467 に存在 |
| `pipeline.ts:471-479` — cleanTransition 探索 `(!t.when \|\| t.when(state))` | ✓ line 478 一致 |
| `pipeline.ts:475` — `!fixerNamesForReroute.has(t.to as string)` (除外条件) | ✓ line 475 一致 |
| `pipeline.ts:483` — `pipeline:fixer:budget-skipped` event emit | ✓ line 483 一致 |
| `pipeline.ts:489-494` — warning history、"proceeding to" 文言 | ✓ line 493 に "proceeding to" 文言あり |
| `pipeline.ts:583-589` — fixer 入場前予算チェック | ✓ line 583–589 一致 |
| `registry.ts:62-67` — loopFixerPairs | ✓ code-review→code-fixer / spec-review→spec-fixer / verification→implementer |

### バグ再現パスの論理確認

`Object.values(loopFixerPairs)` = `["code-fixer", "spec-fixer", "implementer"]`

spec-review approved + spec-fixer budget 枯渇時:
- `budgetSkippedFixer = "spec-fixer"`
- cleanTransition 探索: `!fixerNamesForReroute.has(t.to)` により `implementer` が除外される（implementer は fixerNamesForReroute の要素）
- 候補行 `{ step: SPEC_REVIEW, on: "approved", to: IMPLEMENTER }` が除外される → 探索空振り → fall-through → exhaustion halt

これは request が述べるバグパスと一致する。

### 既存テストファイルの確認

`tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` を通読:
- TC-001/TC-014/TC-016 の存在を確認（TC-014 は `.skip` で無効化済み）
- spec-review approved + spec-fixer budget 枯渇の reroute テストは存在しない（request の主張を確認）

### 修正案の正当性確認

提案する置換:
```ts
const cleanTransition = this.transitions.find(
  (t) =>
    t.step === currentStep &&
    t.on === "approved" &&
    t.to !== budgetSkippedFixer &&
    t.to !== "end" &&
    t.to !== "escalate" &&
    t.when === undefined
);
```

- `t.to !== budgetSkippedFixer` のみを除外することで `implementer` が候補に残る
- `t.when === undefined` は現行の `(!t.when || t.when(state))` より強い絞り（unconditional row のみに限定）
- 発火判定 (`:457`)・`currentStep === exhaustedReviewer` ガード (`:467`)・fixer 入場前予算チェック (`:583-589`) は変更なし → 既存 TC-016 の保護が維持される

## 検証できなかった項目

None。コードアサーションはすべて実コードで照合した。

## Findings 詳細

None。ブロッキング指摘なし。
