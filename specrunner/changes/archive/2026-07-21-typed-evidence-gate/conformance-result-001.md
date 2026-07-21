# Conformance Result — typed-evidence-gate Iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

### タスク完了確認（tasks.md）
全タスク（T-01〜T-09）のチェックボックスが [x] であることを確認。

### 設計判断の実装照合（design.md D1–D7）

- **D1**: `src/kernel/report-result.ts` に `Evidence` インターフェース（checked / skipped / unverified: number）が定義済み。`JudgeReportResult` に `evidence?: Evidence` を追加、`RequestReviewReportResult` には追加なし。
- **D2**: `parseEvidence` ヘルパーが `src/core/port/report-result.ts` に実装済み。`parseJudgeReportInput` の `ok=true` ブロック内で findings 必須化の直後に evidence 必須化を追加。`parseCodeReviewReportInput` / `parseConformanceReportInput` は委譲で自動継承。`parseRequestReviewReportInput` は変更なし。
- **D3**: `deriveJudgeVerdict(findings, ok, evidence?)` に vacuous チェック（`evidence !== undefined && evidence.checked === 0 → escalation`）を追加。`!ok` チェックの直後、decision-needed より前に配置済み。`evidence === undefined` のとき従来導出（後方互換）。`deriveConformanceVerdict` は evidence を転送。
- **D4**: `deriveRegressionGateVerdict` は 2 引数のまま不変。docstring に vacuous 非適用の理由記載。JUDGE_REPORT_TOOL singleton 経由で evidence は必須だが verdict 導出は変えない設計を確認。
- **D5**: `src/state/schema/types.ts` / `src/state/helpers.ts` の toolResult 型に `evidence?` を optional 追加。過去 record は evidence 欠落のまま valid。
- **D6**: `src/prompts/judge-rules.ts` に `EVIDENCE_COUNTS_DEFINITION` を新設。5 つの judge prompt（code-review / spec-review / custom-reviewer / conformance / regression-gate）すべてに注入済み。request-review には注入なし。"report_result" / "end_turn" 文字列なし（プロバイダ中立）。
- **D7**: `step-completion.ts` で `tr.evidence?.checked === 0` 検出時に `stderrWrite` 診断を出力する実装を確認。

### 受け入れ基準の照合（request.md）

1. `checked: 0` + `findings: []` → escalation：`judge-verdict-evidence.test.ts` TC-007 で固定 ✓
2. `checked > 0` + `findings: []` → approved：TC-008 ✓
3. `checked > 0` + blocking findings → needs-fix/escalation 不変：TC-009, TC-010 ✓
4. evidence 欠落の新規報告 → parse 失敗：`evidence-enforcement.test.ts` TC-001 ✓
5. 旧形式 record の読み取り・resume 正常動作：`evidence-backward-compat.test.ts` TC-014, TC-015 ✓
6. judge prompts に evidence 記入指示：`evidence-fragment-coverage.test.ts` TC-016, TC-017, TC-018 ✓
7. `typecheck && test` green：`bun run typecheck` エラーゼロ、`bun run test` 574 files / 8418 tests passed ✓

### Spec 要件の照合（spec.md）

- Requirement 1（evidence counts 必須）：parseJudgeReportInput / parseEvidence で機械強制 ✓
- Requirement 2（vacuous 判定）：deriveJudgeVerdict の vacuous チェック ✓
- Requirement 3（regression-gate は導出不変）：deriveRegressionGateVerdict 変更なし、skipWhen で checked=0 経路到達不能 ✓
- Requirement 4（past records 後方互換）：optional `evidence?` フィールド、消費者は findings のみ参照 ✓
- Requirement 5（単一ソース fragment）：EVIDENCE_COUNTS_DEFINITION を 5 prompt に注入 ✓

## 検証できなかった項目

None。

## Findings 詳細

### [low] `collectFindingsLedger` の引数順序変更が spec 範囲外

`src/core/pipeline/findings-ledger.ts` の `collectFindingsLedger` 関数のシグネチャが
`(state, reviewerChain)` → `(reviewerChain, state)` に変更されており、
`src/core/step/regression-gate.ts` のすべての呼び出し元・テストが追随している。

この変更は request.md / design.md / tasks.md / spec.md のいずれにも記載されておらず、
tasks.md T-06 の「コード変更不要の確認タスク」として指定されたファイルへのコード変更である。

実害は皆無（typecheck / test ともに緑、すべての呼び出し元が一貫して更新済み）だが、
spec 範囲外の変更に該当する。
