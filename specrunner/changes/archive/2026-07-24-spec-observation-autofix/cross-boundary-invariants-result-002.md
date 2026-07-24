# Cross-Boundary Invariants Review: spec-observation-autofix

**Reviewer**: cross-boundary-invariants  
**Iteration**: 2  
**Purpose**: diff が変更していないコードの暗黙の前提（不変条件）を、新しい挙動が黙って破っていないかを検出する。実装そのものは正しくテストも green のまま、既存機構との相互作用にだけ欠陥が宿るクラスのバグを対象とする。

---

## Scope

```
src/core/pipeline/findings-ledger.ts           +43 lines (collectSpecReviewLedger 追加)
src/core/pipeline/spec-observation.ts          +82 lines (new)
src/core/pipeline/types.ts                     +7 guarded transitions
src/core/step/canon-write-scope.ts             +54 buildCanonWriteScopeFromState 追加
src/core/step/fixer-helpers.ts                 +21 INVARIANT コメント追加
src/core/step/judge-verdict.ts                 +21 deriveSpecReviewVerdict 4b 変更
src/core/step/regression-gate.ts               +19 collectSpecReviewLedger 合流
tests/unit/core/pipeline/spec-observation-autofix.test.ts  +1511 (new)
tests/unit/core/pipeline/pipeline.conformance-routing.test.ts  TC-CONFRT-07 更新
```

---

## Iteration 001 Findings の解消確認

### F-1（iteration 001, high）: TC-CONFRT-07 が conformance reverification 経路でなく observation-pass 経路を無言で通過

**解消: Yes**

TC-CONFRT-07 のコードを精査した結果、以下の修正が加えられている。

1. `appendStepResult` helper が `opts.ts` / `opts.findings` を受け取れるよう拡張された（line 108-147）。
2. conformance#1 の StepRun に `ts: "2026-01-01T01:00:00.000Z"`（全他 step の default "2026-01-01T00:00:00.000Z" より厳密に後）と `findings: [...]` が付与された（line 543-548）。
3. アサーション `expect(specReviewCallCount).toBe(4)` が追加された（line 564）。

修正後の経路トレース（maxIterations=2）:

- spec-review#1 (needs-fix) → spec-fixer#1 → spec-review#2 (needs-fix) → spec-fixer#2  
  → [bypass: loopIter=2 & fixerIter=2 ≥ 2] → spec-review#3 (approved, no findings)  
  → test-case-gen → ... → conformance#1 (needs-fix:spec-fixer, ts=T2)  
  → [unpaired reset: spec-fixer・spec-review budget = 0] → spec-fixer#3 (approved)
  - `specFixerForwardsToTestGen`:
    - `getConformanceFixContext`: spec-review#3.endedAt("2026-01-01T00:00:00.000Z") >= conformance#1.endedAt("2026-01-01T01:00:00.000Z") → FALSE → null を返さない → findings 非 null を返す → **条件 1 失敗 → false**
  - 遷移: unconditional `SPEC_FIXER approved → SPEC_REVIEW` → spec-review#4 (reverification)
- spec-review#4 (approved, no findings, specReviewCallCount=4) → test-case-gen → ... → end

アサーション:
- `specFixerCallCount === 3` ✓（observation pass なし、conformance 起点 1 回）
- `specReviewCallCount === 4` ✓（reverification で再実行が確認される）
- `result.status === "awaiting-archive"` ✓

Pipeline integration 級での conformance reverification 不変条件が正しく固定された。

---

### F-2（iteration 001, medium）: `getConformanceFixContext` の `>=` recency が spec-fixer の新しい guard の前提として load-bearing になった

**解消: Yes（ドキュメント化 + TC-CONFRT-07 パターン確立）**

`fixer-helpers.ts:119-128` に明示的な INVARIANT コメントが追加され、呼び出し元が ordered timestamps かつ toolResult.findings を提供しなければならない旨が記述された。TC-CONFRT-07 の修正がその canonical example として機能する。production では pipeline が逐次実行されるため runtime リスクは依然としてない。

---

## 新規 Findings

### F-1（iteration 2）: implementation-notes.md の TC-CONFRT-07 記述が実装より保守的で stale

**対象ファイル**: `specrunner/changes/spec-observation-autofix/implementation-notes.md`（TC-CONFRT-07 節）  
**severity**: low  
**不変条件の境界**: 仕様書と実装の乖離（runtime 影響なし）

**証拠**:

implementation-notes.md（TC-CONFRT-07 フロー変化の記録）は以下のように記述する:

> 期待値変更は不要。  
> T-06 の新規テスト（spec-observation-autofix.test.ts）が proper timestamps を用いた reverification 不変条件をカバーしている。

一方、実際の `pipeline.conformance-routing.test.ts` TC-CONFRT-07 は:
1. conformance に `ts: "2026-01-01T01:00:00.000Z"` と `findings` を付与（ordered timestamps）
2. `expect(specReviewCallCount).toBe(4)` アサーションを追加

この変更は implementation-notes.md に記載されていない。notes を読む読者は「TC-CONFRT-07 は同一タイムスタンプのまま、TC-010 が predicate 単体でカバーする」と誤解する可能性がある。

実際のカバレッジは notes が示すより**強い**（Pipeline integration + predicate 両方でカバー）。runtime への悪影響はなく、カバレッジの過小申告（under-reporting）のみ。

---

## Observations（情報提供のみ）

### O-1: spec-review#4（reverification 後）が fixable findings を持つ場合のテスト fixture リスク

TC-CONFRT-07 で spec-review が always `approved`（no findings）を返す（specReviewCallCount ≥ 3）ため、reverification 後の spec-review が fixable findings を持つシナリオはテストされていない。このシナリオでは:

- spec-review#4.endedAt = "2026-01-01T00:00:00.000Z"（default）  
- conformance#1.endedAt = "2026-01-01T01:00:00.000Z"

`specReviewHasRoutableFixables` = true → guarded 行で spec-fixer へ（observation pass）  
→ `specFixerForwardsToTestGen` の `getConformanceFixContext`: spec-review#4 は conformance より古い timestamp → 依然 non-null → false → spec-fixer が spec-review に戻る（無限ループリスク）

**production**: spec-review#4 は wall-clock で conformance より後に実行されるため、spec-review#4.endedAt > conformance#1.endedAt → `getConformanceFixContext` が null を返す → observation pass が正しく test-case-gen へ進む。runtime 安全性は保たれる。

test fixture での同一タイムスタンプパターンの継承により、将来このシナリオをテスト追加する場合は ordered timestamps が必須。現状のテストはこの経路を踏まないため問題化していない。

### O-2: spec-fixer budget after observation pass → conformance reset の正確性

observation pass で spec-fixer budget が 1 になった後、conformance → spec-fixer 経路に入ると "Unpaired step → fixer episode reset" により spec-fixer および spec-review budget が 0 にリセットされる（`pipeline.ts:527-534`）。conformance は `loopFixerPairs` のキーに存在しない（`{ spec-review: spec-fixer, verification: build-fixer, code-review: code-fixer }`）ため、reset が正しく発火する。TC-CONFRT-07 のトレースで確認済み。

### O-3: `collectSpecReviewLedger` × `deriveRegressionGateVerdict` の canon escalation 経路

regression-gate が spec.md fixable の ledger finding（specLedger 由来）を報告された場合、`deriveRegressionGateVerdict` は R1 (`judgeEffectiveFixer` = code-fixer, spec.md は unroutable) により `escalation` を返す。design D6 に「honest な帰結」として明記されており、不変条件違反ではない。

---

## Summary

| Finding | Severity | 状態 |
|---------|----------|------|
| F-1 (iter 001): TC-CONFRT-07 equal timestamp | high | **Resolved** |
| F-2 (iter 001): getConformanceFixContext load-bearing risk | medium | **Resolved** |
| F-1 (iter 002): implementation-notes.md TC-CONFRT-07 記述 stale | low | New |
