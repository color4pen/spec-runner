# Cross-Boundary-Invariants Review: finding-wontfix-disposition

**Reviewer**: cross-boundary-invariants
**Iteration**: 2
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。

---

## Scope

前周（iteration 1）の 2 つの fixable finding に対して operator 裁定が下り code-fixer が適用された。
本周では両修正の正確性を再確認し、新たに導入された境界違反がないかを検証する。

対象ファイル（今周の変更）:
- `src/core/pipeline/reviewer-chain.ts`
- `src/core/pipeline/findings-ledger.ts`
- `src/core/pipeline/__tests__/reviewer-chain.test.ts`
- `src/core/pipeline/__tests__/findings-ledger.test.ts`

---

## Finding A（iteration 1）の再確認: 修正済み ✓

### `buildReviewerChainTransitions` — sequential chain の `approved + fixable → code-fixer` ガード

修正前: `collectFixableFindings(findings).length > 0`（raw StepRun のまま）
修正後（`reviewer-chain.ts:173-181`）:
```typescript
const fixable = collectFixableFindings(findings);
const active = filterUndecidedFindings(reviewer, fixable, s.decisions);
return active.length > 0;
```

disposition record の `step` は必ず reviewerChain step（wontfix.ts 逆引きが reviewerChain に限定）なので、`filterUndecidedFindings(reviewer, ...)` が正しく一致する。✓

### `buildParallelReviewerTransitions` — code-review 行の同一ガード

修正後（`reviewer-chain.ts:360-368`）:
```typescript
const fixable = collectFixableFindings(findings);
const active = filterUndecidedFindings(STEP_NAMES.CODE_REVIEW, fixable, s.decisions);
return active.length > 0;
```

`filterUndecidedFindings(STEP_NAMES.CODE_REVIEW, ...)` で code-review ステップ名と正しく照合する。✓

### テスト固定

`reviewer-chain.test.ts` の 2 つの `describe` ブロック（sequential / parallel）が各 3 ケース（no-disposition / all-disposed / partial-disposed）をカバーしている。✓

---

## Finding B（iteration 1）の再確認: 修正済み ✓

### `collectParallelFixerFindings` — decisions フィルタ適用

修正後（`findings-ledger.ts:105-107`）:
```typescript
const fixable = collectFixableFindings(findings);
const active = filterUndecidedFindings(name, fixable, state.decisions);
all.push(...active);
```

`name` は各 member の step 名。disposition record の `step` = 発生 step（wontfix.ts 逆引きで確定）と照合する。✓

### テスト固定

`findings-ledger.test.ts` に 2 ケース追加（部分除外 / 全除外）。✓

---

## Iteration 1 で確認済みの 6 不変条件の再確認

1. **`custom-reviewer-round-context.ts` union narrowing** — `.filter((d) => d.kind !== "disposition")` が先行し `selectedOption` アクセスは option arm のみに限定。コードは今周変更なし。✓
2. **`topic-emission.ts` selectedOption guard** — `"selectedOption" in matchedDecision` ガード。今周変更なし。✓
3. **`filterUndecidedFindings` が disposition arm に効く** — step + findingKey 照合は両 arm に存在する共通フィールドで行われる。✓
4. **`collectFindingsLedger` per-step 除外** — TC-009/010/011 がテスト固定済み。✓
5. **all-or-nothing 保証** — `PrepareError(2)` は persist 前に throw。decisions への書き込みなし。✓
6. **後方互換（`kind` 省略）** — inbox planner の既存コードは `kind` を付けず、TypeScript は `OptionDecisionRecord` として受理する。✓

---

## 新たな境界条件の確認

### A. `buildParallelReviewerTransitions` — custom reviewer members にガード行が不要なことの確認

parallel 架構でカスタムレビュアーは coordinator の fan-out で駆動され、遷移テーブルに明示行を持たない。custom reviewer に wontfix'd finding しかない場合:
- step-completion の `filterUndecidedFindings` が finding を除外 → verdict "approved"
- coordinator は approved メンバーを集約 → coordinator "approved"
- `coordinator approved → regression-gate` でゲートへ進む
- ゲートの `computeRegressionLedger` が wontfix'd finding を除外 → ledger empty / clean → passed

code-fixer への不要ルーティングは起きない。✓

### B. `collectFindingsLedger` が ALL StepRuns を走査する副作用

同一ステップの複数 StepRun を走査し、各 run の fixable findings に `filterUndecidedFindings` を適用する。disposition record の `findingKey` はレコード作成時の実 finding から算出される（`wontfix.ts` の逆引きで first-occurrence per step を採用）。

後続 StepRun で同一 fingerprint の finding が rationale を変えて再報告された場合（identity 不安定）、そのランの finding は除外されない。これは request「architect 評価済みの設計判断」として明示的に受容済み。✓

### C. `collectSpecReviewLedger` が decisions フィルタを持たないことの確認

disposition record の `step` は常に reviewerChain step（spec-review は reviewerChain に含まれない）なので、spec-review ledger を `filterUndecidedFindings` でフィルタしても一致しない。非適用は冗長処理の回避であり、spec-review finding が誤って通過する不変条件の破れは起きない。✓

### D. `regressionGateActive` predicate とwontfix resume の整合

wontfix 後に pipeline が regression-gate から再開した場合:
- gate 再実行 → `computeRegressionLedger` が wontfix'd finding を除外 → ledger 空 → `skipWhen` がスキップ理由を返す
- gate verdict: "skipped" → `regression-gate skipped → conformance` ✓

`regressionGateActive` は gate の最終 verdict が "needs-fix" かどうかを見る。gate が skip になれば verdict が更新され、次の code-fixer approved ルーティングで regressionGateActive は false になる。✓

---

## Evidence Summary

| 観点 | 確認方法 | 結果 |
|------|---------|------|
| Finding A 修正（sequential guard） | コード読取 + reviewer-chain.test.ts 3 ケース | ✓ 修正済み |
| Finding A 修正（parallel guard） | コード読取 + reviewer-chain.test.ts 3 ケース | ✓ 修正済み |
| Finding B 修正（collectParallelFixerFindings） | コード読取 + findings-ledger.test.ts 2 ケース | ✓ 修正済み |
| iteration 1 の 6 不変条件 | コード読取（変更なし確認） | ✓ 全数継続保持 |
| parallel custom reviewer のガード不要性 | フロー追跡 | ✓ 設計上不要 |
| spec-review ledger フィルタ省略の正当性 | step 名照合ロジック確認 | ✓ 影響なし |
| identity 不安定（rationale 変更）の受容 | 設計判断の再確認 | ✓ 明示受容済み |

---

## 結論

iteration 1 の 2 つの fixable finding（Finding A / Finding B）は正確に修正され、テストで固定されている。
iteration 2 で新たに導入された境界違反はなし。全確認観点でクリア。
