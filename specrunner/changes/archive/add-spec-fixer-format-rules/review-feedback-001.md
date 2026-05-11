# Code Review Feedback: add-spec-fixer-format-rules — Iteration 1

## Verdict

- **verdict**: approved
- **iteration**: 1
- **blocking_findings**: CRITICAL: 0, HIGH: 0

## Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| correctness | 8 | 0.30 | 2.40 |
| security | 9 | 0.25 | 2.25 |
| architecture | 8 | 0.15 | 1.20 |
| performance | 9 | 0.10 | 0.90 |
| maintainability | 7 | 0.10 | 0.70 |
| testing | 7 | 0.10 | 0.70 |
| **Total** | | | **8.15** |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | src/prompts/spec-fixer-system.ts:41 | propose-system.ts のルール 2 にある LLM 警告文「LLM は MODIFIED を『差分の説明』と解釈してシナリオを省略しやすいが、これは validation error になるため必ず含めること」が省略されている。spec-fixer 自身も LLM であり、同じ省略傾向を持つため、このルールを修正する際にまさに警告対象の失敗パターンを再現するリスクがある。 | ルール 2 の sub-bullet の末尾に propose-system.ts L100 の警告文を追加する。 |
| 2 | LOW | completeness | src/prompts/spec-fixer-system.ts:42 | RENAMED の FROM/TO 構造例（propose-system.ts L102-118 のコードブロック）が省略されている。spec-fixer が RENAMED 関連の finding を修正する際、具体例がないと正しい FROM/TO 構造を生成できない可能性がある。 | ルール 3 の後に propose-system.ts L102-118 相当の markdown コードブロック例を追加する。 |
| 3 | LOW | completeness | src/prompts/spec-fixer-system.ts:34 | request.md の要件「REMOVED セクションではヘッダのみ（本文不要）」が明示されていない。`## REMOVED Requirements — 既存 Requirement を削除する場合` の記述から推測可能だが、他のルール（Scenario 必須、normative keywords 必須）が REMOVED にも適用されるか曖昧になる。 | REMOVED の説明に「header のみ記載し、本文・Scenario は不要」を追記する。 |

## Scenario Coverage (test-cases.md)

| TC | Priority | Covered | Notes |
|----|----------|---------|-------|
| TC-01 | must | yes | `## Delta Spec Format Rules` セクション存在 |
| TC-02 | must | yes | 修正手順の後、修正不能 findings の前に配置 |
| TC-03 | must | yes | ADDED/MODIFIED/REMOVED/RENAMED 全記載 |
| TC-04 | must | yes | `### Requirement:` ヘッダ書式 |
| TC-05 | must | yes | `#### Scenario:` 必須（MODIFIED 含む） |
| TC-06 | must | yes | SHALL/MUST normative keywords |
| TC-07 | must | partial | REMOVED の「ヘッダのみ」は推測可能だが明示なし（Finding #3） |
| TC-08 | must | yes | 独自フォーマット禁止 |
| TC-09 | must | yes | コードブロック禁止 |
| TC-10 | should | yes | ファイル配置ルール |
| TC-11 | must | yes | `${_changesDir}` 不使用 |
| TC-12 | must | yes | Self-review checklist 不含 |
| TC-13 | must | partial | 概ね整合。LLM 警告文と RENAMED 例の省略あり（Finding #1, #2） |
| TC-14 | must | yes | シグネチャ変更なし |
| TC-15 | must | yes | typecheck pass 確認済み |
| TC-16 | must | yes | 1589 tests pass 確認済み |
| TC-17 | should | yes | MODIFIED の Scenario 必須が強調されている |
| TC-18 | must | yes | MODIFIED header 一致ルール記載 |

## Summary

スコープが明確で、実装はクリーン。propose-system.ts の Delta Spec Format Rules を spec-fixer-system.ts に正しく移植し、配置位置も設計通り（修正手順 → Format Rules → 修正不能 findings）。typecheck・全 1589 テスト pass。MEDIUM 1 件（LLM 警告文の省略）は改善推奨だが承認阻止要因ではない。
