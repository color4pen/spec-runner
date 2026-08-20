# approved 温存 reroute の修正: fixer 全体除外をやめ同 verdict の unconditional row へ降りる

## Meta

- **type**: bug-fix
- **slug**: approved-reroute-unconditional-row
- **base-branch**: main
- **adr**: false

## 背景

spec-review が verdict **approved** を出したのに `SPEC_REVIEW_RETRIES_EXHAUSTED`（"spec-review did not approve after 2 iterations"）で awaiting-resume に halt する事象が発生した（issue #1018。job `bf87f3b1` の events.jsonl で実測）。

発火条件は次の 2 つの同時成立:

1. spec-review が **approved + routable fixable finding ≥ 1** を返し、observation auto-fix の guarded 行 `spec-review approved → spec-fixer` に乗る
2. その時点で spec-fixer の episode 予算が枯渇している（`getFixerIter(spec-fixer) >= maxIterations`）

この場合、approved を予算枯渇 halt から守る T-03 reroute が「unconditional な approved 行へ降ろし、budget-skipped 警告を記録して前進する」はずだが、降下先の探索が「to が fixer である行」を**全 fixer 集合**で除外している。build-fixer 廃止で implementer が verification の paired fixer を兼任した結果、正規の降下先 `approved → implementer` まで除外され、探索が空振りして fixer 入場前の予算チェックが exhaustion halt を出す。

バグの本質は、pair 情報 `Object.values(loopFixerPairs)` から「この step は fixer である」という**恒久的 role を逆算した**こと。pair 上の役割は「verification に対しては paired fixer」という文脈付きの事実であり、step 自身の分類ではない。T-03 が skip すべきは「今まさに予算切れした paired fixer への寄り道」だけであり、他の fixer を全局的に除外する理由はない。

## 現状コードの前提

- `src/core/pipeline/types.ts:258` — guarded 行 `{ step: SPEC_REVIEW, on: "approved", to: SPEC_FIXER, when: specReviewHasRoutableFixables }`（observation auto-fix）。`types.ts:260` — unconditional 行 `{ step: SPEC_REVIEW, on: "approved", to: IMPLEMENTER }`。この対が「guarded / unconditional」の並びの実例。
- `src/core/pipeline/pipeline.ts:452-502` — T-03 ブロック。`:453` で `fixerNamesForReroute = new Set(Object.values(this.loopFixerPairs))` を構築し、(a) 発火判定 `fixerNamesForReroute.has(nextStep)`（`:457`）と (b) cleanTransition 探索の除外 `!fixerNamesForReroute.has(t.to)`（`:475`）の両方に使っている。**修正対象は (b) のみ**。(a) の発火判定と `:467` の `currentStep === exhaustedReviewer` ガードは変更しない。
- `src/core/pipeline/pipeline.ts:471-479` — cleanTransition 探索の現行条件は `(!t.when || t.when(state))` で、コメントの「unconditional approved row」より緩い（guarded 行でも条件が true なら拾いうる）。
- `src/core/pipeline/registry.ts:62-67` — `loopFixerPairs` は `code-review → code-fixer` / `spec-review → spec-fixer` / `verification → implementer`。implementer は impl phase の creator でありながら verification の paired fixer を兼任する。
- `src/core/pipeline/pipeline.ts:583-589` — fixer 入場前の予算チェック。`tryExhaust(iteration: getFixerIter(nextStep), stepName: exhaustedLoopName, ...)` が `SPEC_REVIEW_RETRIES_EXHAUSTED`（`types.ts:190-194` の LOOP_ERROR_CODES）を出す。この門番自体は仕様どおりで変更しない。
- T-03 成功時の観測点: `pipeline:fixer:budget-skipped` イベント emit（`pipeline.ts:483`）と warning history（`:489-494`、`lastReviewerFixableCount` による未適用 finding 数入り、"proceeding to <next>" 文言）。
- 既存テスト `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts` — TC-001/TC-014（破壊確認）は code-review 版の T-03。TC-016 は「spec-review approved (isTestGenExempt) → implementer が verification の fixer 予算に巻き込まれない」という別ケース。**spec-fixer 予算枯渇時の spec-review approved reroute のテストは存在しない**（このギャップが本バグを見逃した）。

## 要求

### 1. cleanTransition 探索の置換

`src/core/pipeline/pipeline.ts:471-479` の探索を次に置き換える。`fixerNamesForReroute` は探索から完全に消し、除外は `budgetSkippedFixer` 単体 + unconditional 縛りにする:

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

`t.when === undefined` は現行の `(!t.when || t.when(state))` より強い絞りであり、これが意図した仕様である（T-03 の機能定義: **選択済み guarded route の paired fixer が予算切れのとき、同じ verdict の unconditional row へ降りる**）。

### 2. T-03 コメントの定義更新

`pipeline.ts:431-451` 周辺の T-03 コメントを新しい機能定義に合わせて更新する（「clean approved transition = 同 verdict の unconditional row」「除外は skip 対象の paired fixer 単体」）。destruction confirmation コメント（TC-014 参照）は再現手順が変わらない範囲で保持する。

### 3. spec-fixer 版の再現テスト

spec-review needs-fix → spec-fixer を 2 周して予算を消費した後、spec-review に approved + low/fixable（spec-fixer writable canon path 宛）を返させる再現テストを追加し、以下を pin する:

- 最終 status が awaiting-resume にならず、`SPEC_REVIEW_RETRIES_EXHAUSTED` が出ない
- `pipeline:fixer:budget-skipped` が `step=spec-review, fixer=spec-fixer` で emit される
- warning history に未適用 finding 数が残る
- implementer が実行される

このテストは修正前のコードでは red になる（awaiting-resume + `SPEC_REVIEW_RETRIES_EXHAUSTED`）ことを修正前に確認する。

## 受け入れ基準

- [ ] 再現テスト（要求 3 の 4 点 pin）が追加され green。修正を要求 1 の置換前に戻すと同テストが red になる（破壊確認）
- [ ] `pipeline.ts` の cleanTransition 探索から `fixerNamesForReroute` への参照が消え、`t.when === undefined` + `t.to !== budgetSkippedFixer` + end/escalate 除外になっている
- [ ] T-03 の発火判定（`:457`）・`currentStep === exhaustedReviewer` ガード（`:467`）・fixer 入場前予算チェック（`:583-589`）は無変更
- [ ] 既存 `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts`（TC-001/TC-014/TC-016 ほか）が無改変で green
- [ ] `bun run typecheck` / `bun run test` green

## スコープ外

- T-03 の発火条件側（`fixerNamesForReroute.has(nextStep)` / `currentStep === exhaustedReviewer`）の再設計
- `loopFixerPairs` の構造変更（pair 上の役割と step 自身の role の型レベル分離）
- approved 以外の verdict（passed 等）への T-03 の一般化
- spec-review loop の needs-fix 経路の変更（issue #1015 の別 request が担当）
