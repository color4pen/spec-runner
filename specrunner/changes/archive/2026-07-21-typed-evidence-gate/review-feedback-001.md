# Code Review Feedback — typed-evidence-gate iteration 1

<!-- EVIDENCE REPORT FORMAT:
     verdict は CLI が typed findings から導出する。この file に verdict 行を書かない。
     findings は report_result（typed）で報告し、この file はその補足の evidence report である。
-->

## 検証した項目

1. **diff stat 確認** — `git diff main...HEAD --stat` で変更ファイル一覧を取得（50 files, 3315+ insertions）
2. **design.md / tasks.md / spec.md / test-cases.md 通読** — 受け入れ基準・設計判断を把握
3. **`src/kernel/report-result.ts`** — `Evidence` インターフェース追加の確認（T-01）
4. **`src/core/port/report-result.ts`** — `Evidence` re-export、`parseEvidence` 実装、`JudgeReportResult.evidence?` フィールド、`parseJudgeReportInput` の evidence 必須化（`ok=true` ブロック内に配置）、`parseConformanceReportInput`/`parseCodeReviewReportInput` の委譲確認（T-01/T-02）
5. **`src/core/step/report-tool.ts`** — `JUDGE_REPORT_TOOL` / `CODE_REVIEW_REPORT_TOOL` / `CONFORMANCE_REPORT_TOOL` に `evidence: optional(evidenceSchema)` 追加、description 更新。`REQUEST_REVIEW_REPORT_TOOL` が変更なし（T-03）
6. **`src/core/step/judge-verdict.ts`** — `deriveJudgeVerdict` の第 3 引数 `evidence?` 追加と vacuous ルール（rule 2: checked=0 → escalation）の実装。`deriveConformanceVerdict` への evidence 転送。`deriveRegressionGateVerdict` の不変と docstring 追加（T-04）
7. **`src/core/port/step-types.ts`** — `judgeVerdictFn` 型に `evidence?` 追加（T-04）
8. **`src/core/step/step-completion.ts`** — isConformanceStep / isJudgeStep 分岐での evidence 受け渡し。`checked=0` の stderr 診断出力。`persistToolResult` 型拡張（T-05）
9. **`src/state/schema/types.ts` + `src/state/helpers.ts`** — `StepOutcome.toolResult` / `StepResultInput.toolResult` に `evidence?: Evidence` を additive 追加（T-06）
10. **`src/prompts/judge-rules.ts`** — `EVIDENCE_COUNTS_DEFINITION` 定義と内容確認（T-07）
11. **5 prompt ファイルへの注入確認** — code-review / spec-review / custom-reviewer / conformance / regression-gate が `EVIDENCE_COUNTS_DEFINITION` を含むこと、request-review が含まないこと（T-07）
12. **テストファイル群** — TC-001〜TC-026 が `evidence-enforcement.test.ts` / `judge-verdict-evidence.test.ts` / `evidence-fragment-coverage.test.ts` / `evidence-backward-compat.test.ts` / `step-completion-evidence-diagnostic.test.ts` / `report-tool-evidence-schema.test.ts` にカバーされていることを確認（T-08）
13. **フィクスチャ追随** — `tests/helpers/pipeline-mock-client.ts` の judge 系 approved 入力に evidence 追加を確認（T-08）
14. **`src/core/pipeline/findings-ledger.ts`** — パラメータ順序変更（`(state, reviewerChain)` → `(reviewerChain, state)`）と全 call site の更新を確認
15. **`bun run typecheck`** — 実行、exit 0（型エラーゼロ）
16. **`bun run test`** — 実行、8418 passed / 1 skipped（TC-028 integration は pipeline-mock-client 経由で緑確認）

## 検証できなかった項目

- TC-027/TC-028: CLI 上で実行・確認済み（green）。managed runtime での実際のエージェント動作は未確認（スコープ外）。

## Findings 詳細

### F-001: EVIDENCE_COUNTS_DEFINITION に "escalation" が含まれ D6 の設計意図と乖離

design.md D6 は「文言を「判定不能」に留め（EVIDENCE_DISCIPLINE と同語彙）、具体的 routing（escalation）を断定しない（regression-gate と共有するため）」と明示している。

しかし実装の `EVIDENCE_COUNTS_DEFINITION`（`judge-rules.ts:99`）には：
```
- `checked === 0` は「判定不能」として扱われ、`escalation` になります。
```
と記載されており、"escalation" が明示されている。このフラグメントは `regression-gate-system.ts` にも注入されるが、`deriveRegressionGateVerdict` は vacuous ルールを適用しないため、"escalation になります" という断定は regression-gate agent に対して不正確な情報になる。

実際の behavioral 影響は minimal（regression-gate は skipWhen で ledger 非空時のみ実行され、checked=0 経路は実運用で到達不能）だが、D6 で明示的に却下された設計判断に反する。

TC-017 は `report_result` / `end_turn` の不在のみ検証しており、"escalation" の不在は検証対象外のため、このずれは自動テストで検出されない。

**修正案**: `escalation になります` を削除し、`判定不能として扱われます` で留める。

### F-002: collectFindingsLedger のパラメータ順序変更はスコープ外

`src/core/pipeline/findings-ledger.ts` のシグネチャが `(state, reviewerChain)` から `(reviewerChain, state)` に変更されている。いずれのタスク（T-01〜T-09）にも記載なし。

機能的影響はない（TypeScript が型安全に全 call site を更新、8418 テスト緑）。スコープ外の純粋なリファクタリングとして記録する。
