# Cross-Boundary Invariants Review: spec-observation-autofix

**Reviewer**: cross-boundary-invariants  
**Iteration**: 1  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope

```
src/core/pipeline/findings-ledger.ts           +43 lines
src/core/pipeline/spec-observation.ts          +70 lines (new)
src/core/pipeline/types.ts                     +7 / -0  guarded transitions
src/core/step/canon-write-scope.ts             +54 / -0 buildCanonWriteScopeFromState
src/core/step/judge-verdict.ts                 +21 / -0 deriveSpecReviewVerdict 4b
src/core/step/regression-gate.ts              +19 / -0 collectSpecReviewLedger merge
tests/unit/core/pipeline/spec-observation-autofix.test.ts  +1511 (new)
tests + existing test updates
```

---

## Cross-Boundary Invariants Examined

### 1. conformance reverification 経路の不変条件
**不変**: `conformance needs-fix:spec-fixer` 起点で入場した spec-fixer は必ず spec-review に戻る（test-case-gen に直行しない）。

### 2. observation pass 経路の孤立性
**不変**: observation pass の spec-fixer → test-case-gen 遷移は、直前の spec-review verdict が approved かつ conformance context が null の場合のみ発火する。

### 3. `getConformanceFixContext` の recency 前提
**不変**: `getConformanceFixContext` の `>=` recency check は「conformance が spec-review より後に実行された」ことを正しく判定する。実行時には常に conformance.endedAt > spec-review.endedAt が成立する（pipeline は逐次実行）。

### 4. regression-gate の ledger 統合
**不変**: `skipWhen` と `buildMessage` は同一の ledger 計算式を使う（divergence → 実行判定とレポートの不一致）。

### 5. T-03 reroute との相互作用
**不変**: spec-fixer budget 枯渇時、T-03 は fixer でない clean 行（spec-review approved → test-case-gen）へリルートし、直行遷移を正しく skip する。

---

## Findings

### F-1: TC-CONFRT-07 が conformance reverification 経路でなく observation-pass 経路を無言で通過している

**対象ファイル**: `tests/unit/core/pipeline/pipeline.conformance-routing.test.ts`（line 478-529）  
**不変条件の境界**: `getConformanceFixContext` の `>=` recency check と `specFixerForwardsToTestGen` の新しい依存関係

**証拠**:

TC-CONFRT-07 の `appendStepResult` helper は全 step に固定タイムスタンプ `"2026-01-01T00:00:00.000Z"` を使用する（line 114-115）。

```typescript
startedAt: "2026-01-01T00:00:00.000Z",
endedAt: "2026-01-01T00:00:00.000Z",
```

`getConformanceFixContext`（`fixer-helpers.ts:121`）の recency check:
```typescript
if (latestPredecessor && latestPredecessor.endedAt >= latestConformance.endedAt) {
  return null; // predecessor ran at or after conformance → not conformance-triggered
}
```

spec-review.endedAt (`"2026-01-01T00:00:00.000Z"`) >= conformance.endedAt (`"2026-01-01T00:00:00.000Z"`) → **true** → `getConformanceFixContext` は null を返す。

`specFixerForwardsToTestGen`（`spec-observation.ts:60`）の条件:
1. `getConformanceFixContext(state, SPEC_FIXER) === null` → **true**（equal timestamps）
2. 最新 spec-review verdict が `"approved"`（specReviewCallCount >= 3 で approved を返す）→ **true**

結果: spec-fixer#3（conformance 起動のはず）は test-case-gen へ直行する。

テストアサーション（`specFixerCallCount === 3`, `result.status === "awaiting-archive"`）は引き続き pass するが、検証している経路は `conformance → spec-fixer → spec-review reverification` ではなく `conformance → spec-fixer → test-case-gen（observation pass）` になっている。

受け入れ基準「conformance の needs-fix:spec-fixer 起点の spec-fixer が従来どおり spec-review 再検証に戻る（test-case-gen に直行しない）ことをテストで固定する」に対し、**Pipeline integration テストレベルでの担保が失われている**。

TC-010（`spec-observation-autofix.test.ts` line 503-555）は predicate 単体を proper timestamps で検証するが、pipeline.ts の T-03 budget-reset ロジックと組み合わせた **Pipeline integration level の conformance reverification** は未カバー。

---

### F-2: `specFixerForwardsToTestGen` の conformance guard が同一タイムスタンプ state で false negative を生じる（テスト設計上のリスク）

**対象ファイル**: `src/core/pipeline/spec-observation.ts`（line 60-70）  
**不変条件の境界**: `getConformanceFixContext` の `>=` recency 前提が新しい spec-fixer → test-case-gen guard に load-bearing になった

**証拠**:

変更前: `getConformanceFixContext` の `>=` 前提はコード ファイクサー（code-fixer）側の `findingsForCodeFixer` 経路でのみ使われており、code-review は常に conformance より先に実行されるため、同一タイムスタンプ state は問題になっていなかった。

変更後: spec-fixer 用の `specFixerForwardsToTestGen` が同じ `getConformanceFixContext` に依存する。spec-fixer は conformance より **前にも後にも** 実行されうる（observation pass: spec-review より後、conformance より先）ため、両タイムスタンプが等しい test state で誤ったルーティングが起きる。

Production では pipeline が逐次実行（LLM agent が秒〜分単位で処理）されるため conformance.endedAt > spec-review.endedAt は常に成立し、runtime 上の不変条件破壊はない。ただし、同一タイムスタンプを使う test fixture パターンが今後他の統合テストでも踏む可能性がある。

---

## Observations（情報提供のみ、要アクション不要）

### O-1: `collectSpecReviewLedger` は needs-fix ラウンドの finding も全量収集する

`collectSpecReviewLedger` は `state.steps[SPEC_REVIEW]` の **全** StepRun（needs-fix ラウンドを含む）の fixable finding を収集する。設計 D6 に「spec-review の全 StepRun を走査」と明記されており、impl 側 `collectFindingsLedger` と対称。不変条件違反ではなく、regression-gate が needs-fix ラウンドで修正された finding の regression も検出できるという保守的な設計。

### O-2: regression-gate による spec-review finding の機械検証は custom reviewer 存在時のみ

design.md が明示するとおり、regression-gate は `compose-reviewers.ts` によって custom reviewer 存在時のみ pipeline に注入される。標準 pipeline（custom reviewer なし）では `collectSpecReviewLedger` は呼ばれず、observation pass で消化された finding の post-hoc machine verification は実施されない。impl 側 observation auto-fix と対称であり、受け入れ基準もこの制約を前提としていない。設計上の accepted trade-off。

### O-3: T-03 reroute と guarded 遷移の相互作用は正しい

T-03 の clean transition 探索（`!fixerNamesForReroute.has(t.to as string) && (!t.when || t.when(state))`）は spec-fixer を fixer セットから除外する。spec-review approved → test-case-gen（unconditional 行）が clean transition として選ばれ、spec-fixer budget 枯渇時は observation pass がスキップされて test-case-gen へ直行する。Observation pass がスキップされた場合の spec-review finding は ledger に残り、regression-gate（存在する場合）が escalation で検出する。この挙動は correct かつ honest。

---

## Verdict Rationale（参考）

F-1 は high severity の構造的テストカバレッジ欠損：受け入れ基準が Pipeline integration level でのテスト固定を要求しているにもかかわらず、既存の Integration テスト（TC-CONFRT-07）が無言で別経路を通過し、新規の TC-010 は predicate unit test に留まる。

F-2 は medium severity：production では `>=` 前提が常に成立するため runtime リスクは低いが、`getConformanceFixContext` の inclusive `>=` が spec-fixer の新しい invariant guard の前提になったことで、テスト設計上の false negative パターンが拡大している。
