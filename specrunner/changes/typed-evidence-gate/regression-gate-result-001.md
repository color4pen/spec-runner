# Regression Gate Evidence Report — typed-evidence-gate iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

1. **git diff main...HEAD --stat** — 変更ファイル一覧を取得（52 files）
2. **events.jsonl 通読** — code-fixer が「2件とも LOW severity。修正対象なし（HIGH/CRITICAL なし、MEDIUM なし）。ファイル変更なし。」と明示して全 findings を未修正のまま通過させたことを確認
3. **src/prompts/judge-rules.ts:99** — `EVIDENCE_COUNTS_DEFINITION` の末尾行を直接読取り確認（Finding 1 + 3）
4. **src/core/pipeline/findings-ledger.ts:28** — `collectFindingsLedger` のシグネチャを読取り確認（Finding 2）
5. **src/core/step/step-completion.ts:163-164** — isJudgeStep 分岐の stderrWrite 文を読取り確認（Finding 4）
6. **specrunner/adr/2026-07-14-reduce-added-agent-turns.md:13,61** — 旧シグネチャ参照箇所を読取り確認（Finding 5）
7. **specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md:57** — 同上（Finding 5 関連）

## 検証できなかった項目

なし（5件すべてのコード箇所を直接読取り済み）

## 検証結果

### Ledger item 1 & 3（REGRESSION）: EVIDENCE_COUNTS_DEFINITION に "escalation" が残存

- **ファイル**: `src/prompts/judge-rules.ts:99`
- **現在の状態**（未修正）:
  ```
  - `checked === 0` は「判定不能」として扱われ、`escalation` になります。何かしら検証した場合は checked に実測値を記入してください。
  ```
- **期待される状態**: 「escalation になります」を「判定不能として扱われます」に変更
- **判定**: REGRESSION — code-fixer が LOW severity を理由に修正をスキップしたため、D6 違反の文言が残存。MEDIUM severity だった cross-boundary-invariants の finding も同様に未修正。

### Ledger item 2（REGRESSION）: collectFindingsLedger のスコープ外パラメータ順序変更が残存

- **ファイル**: `src/core/pipeline/findings-ledger.ts:28`
- **現在の状態**（未修正）:
  ```typescript
  export function collectFindingsLedger(
    reviewerChain: string[],
  	state: JobState,
  ): Finding[]
  ```
- **期待される状態**: `(state, reviewerChain)` への revert、または ADR/request へのスコープ外変更の文書化と承認
- **判定**: REGRESSION — code-fixer がスキップした結果、スコープ外変更が残存。

### Ledger item 4（REGRESSION）: step-completion.ts isJudgeStep 診断の "escalation" 誤報が残存

- **ファイル**: `src/core/step/step-completion.ts:164`
- **現在の状態**（未修正）:
  ```typescript
  stderrWrite(`[${step.name}] vacuous check: checked=0 — 検証実績ゼロのため approved を保留し escalation`);
  ```
- **期待される状態**: regression-gate は `deriveRegressionGateVerdict` を使い evidence を無視するため、診断文言から `escalation` を削除するか judgeVerdictFn が `deriveJudgeVerdict` のときのみ断定する guard を追加する
- **判定**: REGRESSION — code-fixer がスキップした結果、誤情報を提示する診断が残存。

### Ledger item 5（REGRESSION）: ADR が旧シグネチャ `(state, chain)` を参照したまま

- **ファイル**: `specrunner/adr/2026-07-14-reduce-added-agent-turns.md:13,61`（および `specrunner/adr/2026-06-12-reviewer-chain-regression-gate.md:57`）
- **現在の状態**（未修正）:
  - 行 13: `collectFindingsLedger(state, reviewerChain)`
  - 行 61: `collectFindingsLedger(state, deriveImplReviewerChain(state))`
  - 2026-06-12 ADR 行 57: `collectFindingsLedger(state, reviewerChain)`
- **期待される状態**: 新シグネチャ `(reviewerChain, state)` に更新
- **判定**: REGRESSION — code-fixer がスキップした結果、ライブドキュメントの信頼性が低下したまま。

## まとめ

ledger 5件のうち、items 1 と 3 は同じファイル・行を指す（code-review と cross-boundary-invariants の重複指摘）。コード上は1箇所の修正で両方が解消する。

**5件全て未修正**。code-fixer が「LOW severity のみ → 修正不要」と判断してスキップしたが、regression-gate ledger は severity によらず fixable findings が残存していれば needs-fix を返す設計（`deriveRegressionGateVerdict`）のため、全4箇所（judge-rules.ts / findings-ledger.ts / step-completion.ts / ADR）の修正が必要。
