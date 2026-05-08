# Code Review — fix-propose-modified-scenarios — Iteration 1

- **verdict**: approved
- **total-score**: 8.2

## Scope

- `src/prompts/propose-system.ts` — prompt text changes only (13 lines added/3 removed)
- No logic, API, or dependency changes

## Scores

| Category | Score | Weight | Notes |
|----------|-------|--------|-------|
| correctness | 9 | 0.30 | 全 3 design decisions (D1, D2, D3) を正確に実装。受け入れ基準 4 項目すべて充足 |
| security | — | (skip) | prompt text only, no security surface |
| architecture | 9 | 0.15 | 最小変更。Rule 2 の補足として追加、ルール番号変更なし |
| performance | — | (skip) | 数行のプロンプト追加、token 影響無視可能 |
| maintainability | 8 | 0.10 | Rule 2 の sub-bullet として自然に読める。例示の具体化も良い |
| testing | 5 | 0.10 | delta spec のシナリオ 2 件が未テスト（下記 #1） |

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | testing | tests/prompts/propose-system.test.ts | delta spec に "System prompt includes MODIFIED scenario rule" と "Self-review checklist covers MODIFIED scenarios" の 2 シナリオがあるが、対応するテストが未追加。既存 TC-007〜TC-012 と同じ `toContain()` パターンで回帰保護できる | `PROPOSE_SYSTEM_PROMPT` に対して `toContain("MODIFIED Requirements にも最低 1 つの Scenario")` と checklist の MODIFIED 項目を assert するテストを追加する |

## Summary

プロンプト修正は design.md の 3 決定事項を忠実に反映しており、correctness は問題なし。Rule 2 の sub-bullet 追加、例示の具体化、checklist 項目追加の 3 点が正しく実装されている。verification (build/typecheck/test) も passed。

唯一の指摘は、既存テストが TC-007〜TC-012 で prompt の構造的不変条件を `toContain()` で検証しているのに対し、今回追加した MODIFIED 固有の指示には同等のテストがない点。request の受け入れ基準では「効果検証は次回の実パイプライン実行で確認」としているが、prompt テキストの存在検証は既存パターンで可能であり、regression guard として推奨。

CRITICAL: 0, HIGH: 0 のため approved。
