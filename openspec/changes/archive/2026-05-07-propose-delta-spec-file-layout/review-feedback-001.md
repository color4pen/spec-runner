# Code Review — propose-delta-spec-file-layout — Iteration 1

## Summary

Prompt へのファイル配置ルール追加（3 行 + checklist 1 項目）と propose-session delta spec（3 Requirement, 7 Scenario）。変更は小規模で仕様に忠実。コード変更は `propose-system.ts` のみ、型・テスト全 green。

## Scores

| Category | Score | Rationale |
|----------|-------|-----------|
| correctness | 9 | request の 4 要件すべてを正確に実装。prompt 追加内容と delta spec の Scenario が仕様と一致 |
| security | 10 | セキュリティ影響なし（prompt 文字列とスペックファイルのみ） |
| architecture | 9 | 既存の Delta Spec Format Rules セクション内に配置。設計判断（ADDED vs MODIFIED）が適切 |
| performance | 10 | ランタイム影響なし |
| maintainability | 8 | prompt と spec の二重管理リスクはあるが design.md で認識済み。粒度の差を根拠に許容 |
| testing | 7 | 既存テスト 18 件が green。新規追加分のファイル配置ルール存在確認テストがない（下記 finding #1） |

**Total: 0.30×9 + 0.25×10 + 0.15×9 + 0.10×10 + 0.10×8 + 0.10×7 = 2.70 + 2.50 + 1.35 + 1.00 + 0.80 + 0.70 = 9.05**

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | testing | tests/prompts/propose-system.test.ts | ファイル配置ルール（`ファイル配置` セクション、`capability-name` キーワード）の存在を確認するテストがない。既存テストは path-fence と CLI ワークフローのみ | `describe("delta spec file layout rules")` を追加し、`PROPOSE_SYSTEM_PROMPT` に `ファイル配置`、`specs/<capability-name>/spec.md`、`フラットファイルは禁止` が含まれることを assert する |

## Scenario Coverage

test-cases.md が本 change に存在しないため、request.md の受け入れ基準で代替評価:

| 受け入れ基準 | 状態 | 根拠 |
|-------------|------|------|
| prompt にファイル配置ルールが明記されている | PASS | `propose-system.ts` L124-128 に追加確認 |
| propose-session spec に openspec CLI + delta spec ルールが delta spec として含まれている | PASS | `specs/propose-session/spec.md` に 3 Requirement, 7 Scenario |
| `bun run typecheck && bun run test` が green | PASS | verification-result.md: 108 files, 963 tests passed |
| delta spec が `openspec validate` を pass する | PASS | tasks.md 3.3 で確認済み |

## Iteration Comparison

N/A（初回イテレーション）

- **verdict**: approved
