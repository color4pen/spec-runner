# Cross-Boundary Invariants Review — Result 002

**Change**: absorb-build-fixer
**Reviewer**: cross-boundary-invariants
**Iteration**: 2

## Purpose

diff が**変更していない**コードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。
実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Executive Summary

前 round の medium finding（`fixerNamesForReroute` ブロックが `spec-review approved → implementer (isTestGenExempt)` を誤 intercept）は `currentStep === exhaustedReviewer` guard（pipeline.ts:467）によって解消済み。コードトレースで確認。

新たに **medium / fixable** finding が 1 件：上記 guard が保護する cross-boundary シナリオに直接対応するテストが存在せず、guard の削除が既存テストによって検知されない。

---

## Findings

### F-1 [medium / fixable] `currentStep === exhaustedReviewer` guard は実装済みだがシナリオテストなし

**File**: `src/core/pipeline/pipeline.ts:467`
**Related**: `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts`

#### 対象 guard（コード）

```typescript
if (currentStep === exhaustedReviewer && budget.getFixerIter(budgetSkippedFixer) >= effectiveMaxReroute) {
```

#### guard が保護するシナリオ

`loopFixerPairs[VERIFICATION] = IMPLEMENTER` になったことで、`Object.values(loopFixerPairs)` に `"implementer"` が含まれる。
このため `fixerNamesForReroute` には `{ "spec-fixer", "code-fixer", "implementer" }` が入る。

以下の経路を組み合わせると **guard なし**では誤 intercept が発生する：

1. exempt タイプ（isTestGenExempt=true）が verification 回復ループに入り、implementer fixer カウンタが N まで積み上がる
2. その後、conformance → spec-fixer → spec-review → **approved（exempt）** となる（spec-review が "approved" を返す）
3. `fixerNamesForReroute` ブロック内：
   - `outcome = "approved"`, `nextStep = "implementer"`, `fixerNamesForReroute.has("implementer") = true` → ブロックに入る
   - `exhaustedReviewer = resolvePairedReviewForFixer(state, "implementer", ...) = "verification"`
   - **guard なし**の場合：`budget.getFixerIter("implementer") = N >= max` → intercept 発動
   - clean transition 探索：spec-review の approved 行のうち fixer 以外 → `TEST_MATERIALIZE` が選ばれる
   - 誤って `nextStep = "test-materialize"` に re-route される（exempt 経路で正しくは `"implementer"`）

**guard あり**（現状のコード）：
- `currentStep("spec-review") === exhaustedReviewer("verification")` → `false`
- ブロック発動せず → `nextStep = "implementer"` のまま正しく進む ✓

#### テストギャップ

`pipeline.approved-not-overturned-by-fixer-budget.test.ts` は `code-review approved + code-fixer budget exhausted` を検証するが、
`spec-review approved + verification/implementer budget exhausted` の組み合わせをカバーするテストは存在しない。
guard を削除すると既存テストはすべて green のまま、上記 re-route バグが潜伏する。

**Recommended fix**: `pipeline-exhaustion.test.ts` または `pipeline.approved-not-overturned-by-fixer-budget.test.ts` に以下シナリオを追加する：
- STANDARD pipeline、exempt タイプ
- implementer fixer カウンタを exhaustion 直前まで積み上げた後、spec-review が approved を返す
- `nextStep` が `implementer`（`test-materialize` でも `end` でもない）であることをアサート

---

## Verified Invariants (No Finding)

### V-1: 前 round finding 解消確認

前 round: `fixerNamesForReroute` ブロックが `spec-review approved → implementer (isTestGenExempt)` を誤 intercept
状態: **解消済み**

`currentStep === exhaustedReviewer` guard（pipeline.ts:467）のコードトレース：

| 経路 | currentStep | exhaustedReviewer | 一致 | 結果 |
|------|-------------|-------------------|------|------|
| spec-review approved → implementer (isTestGenExempt) | `"spec-review"` | `"verification"` | **false** | ブロック発動せず ✓ |
| code-review approved → code-fixer (budget exhausted) | `"code-review"` | `"code-review"` | **true** | 正常 intercept ✓ |
| verification failed → implementer | — | — | outcome が "approved" ではないためブロック自体に入らない ✓ |

### V-2: `verificationFailedLast` による遷移ガードの正確な動作

`IMPLEMENTER success` の遷移表順序（STANDARD）：

```
{ when: isTestGenExempt }   → VERIFICATION  (exempt 用バイパス)
{ when: verificationFailedLast } → VERIFICATION  (回復再入)
unconditional              → BITE_EVIDENCE  (通常)
```

以下すべての組み合わせを確認：

| isTestGenExempt | verificationFailedLast | 遷移先 |
|-----------------|----------------------|--------|
| true | true | VERIFICATION（最初のマッチ: isTestGenExempt 行）✓ |
| false | true | VERIFICATION（2 番目のマッチ: verificationFailedLast 行）✓ |
| false | false | BITE_EVIDENCE（unconditional）✓ |

### V-3: session 継続の一貫性

`step-context-builder.ts` と `implementer.buildMessage` はともに同じ `state` に対して
`verificationFailedLast(state)` と `getPreviousSessionId(state, IMPLEMENTER)` を参照する。
どちらも同一実行タイミングに呼ばれるため結果が乖離する余地はない。

- `getPreviousSessionId = null` → `resumeSessionId = undefined`（fresh）、`buildMessage` → full initial + failure section ✓
- `getPreviousSessionId = "id"` → `resumeSessionId = "id"`（継続）、`buildMessage` → short recovery message ✓

### V-4: "Unpaired step → fixer episode reset" の新挙動

旧コードでは implementer が `loopFixerPairs.values()` に含まれなかったため、
`conformance → implementer (needs-fix:implementer)` では unpaired reset がトリガーされなかった。
新コードでは `"implementer" in fixerNames` = true のためリセットが発動する。

発動結果：`resetFixerStep("implementer")` + `resetLoopStep("verification")`

旧コードでは bite-evidence → verification のエピソードリセットで同等の効果を得ていた。
二段階リセットは idempotent であり net effect は同じ（verification が fresh budget で開始される）。
conformance 経由の再入が正しく fresh 予算を得ることは変わらない ✓

### V-5: `build-fixer → implementer` legacy alias の網羅性

`resolve-step.ts` の `LEGACY_STEP_ALIASES = { "build-fixer": STEP_NAMES.IMPLEMENTER }` は
以下のすべての復帰経路に適用される：

| 経路 | 適用箇所 | 結果 |
|------|----------|------|
| `--from build-fixer` | `from` 分岐の `legacyResolved` | `"implementer"` → `allowed.has("implementer") = true` → 成功 ✓ |
| `resumePoint.step = "build-fixer"` | `resumePoint` 分岐の `legacyResolved` | `"implementer"` → `toStepName()` で返却 ✓ |
| `handleExhausted` の `resumeStep` | 直接参照なし（handleExhausted は `loopFixerPairs["verification"] = "implementer"` から生成） | `"implementer"` ✓ |

### V-6: `enrichContext` は非回復パスで無害

`ImplementerStep.enrichContext` は全 implementer 実行で `verification-result.md` を先読みするが：
- ファイル不在（初回実行前）→ catch → 元の dynamicContext をそのまま返す ✓
- `buildMessage` は `verificationFailedLast(state) = true` のときのみ `verificationContent` を参照する ✓
- 非回復パス（初回・conformance 再入）では `verificationContent` は dynamicContext に保持されたまま使われない ✓

### V-7: `getConformanceFixContext` と `verificationFailedLast` の相互排他性

conformance triggered（`verificationFailedLast = false`）と recovery triggered（`verificationFailedLast = true`）の両条件が
同時に真になるケースを排除できる根拠：

`getConformanceFixContext` の recency チェック：`latestPredecessor.endedAt >= latestConformance.endedAt` → null を返す。
verification failure → implementer recovery の場合、implementer（predecessor）は conformance より後に実行されている
（verification failure は conformance 後の reverification でのみ発生する）。
よって `getConformanceFixContext` は null を返し、`buildMessage` は recovery path のみを通る ✓

### V-8: FAST pipeline R1 off-by-one の設計内許容

FAST / exempt 経路での implementer fixer カウンタ off-by-one（creator 実行で +1 → bite-evidence リセット無し）は
design.md R1 に「歯は発火し続ける、exact 回数は要件外」として明示的に許容済み。
`VERIFICATION_RETRIES_EXHAUSTED` は引き続き発火する ✓

---

## Evidence

- 確認ファイル: `src/core/pipeline/pipeline.ts`, `src/core/pipeline/types.ts`, `src/core/pipeline/registry.ts`, `src/core/pipeline/reverification.ts`, `src/core/step/implementer.ts`, `src/core/step/step-context-builder.ts`, `src/core/step/fixer-helpers.ts`, `src/core/resume/resolve-step.ts`, `src/core/step/write-scope.ts`, `src/kernel/step-names.ts`
- テストファイル確認: `tests/unit/absorb-build-fixer/transitions.test.ts`, `tests/unit/absorb-build-fixer/pipeline-exhaustion.test.ts`, `tests/core/pipeline/pipeline.approved-not-overturned-by-fixer-budget.test.ts`
- confirmed: 9, skipped: 0, unverified: 0
