# Spec Review Result — fix-propose-modified-scenarios

- **iteration**: 2
- **date**: 2026-05-08
- **verdict**: approved

## Summary

Iteration 1 の HIGH finding（delta spec で既存 scenario 2 件が脱落）は修正済み。既存 3 scenario + 新規 2 scenario の計 5 scenario が delta spec に含まれており、archive 適用時の scenario 消失リスクは解消。proposal / design / tasks は request の要件・受け入れ基準を正確にカバーしている。セキュリティ観点ではプロンプト文字列の修正のみであり、認証・入力検証・API への影響なし。

## Iteration Comparison

### Improvements
- Finding #1 (HIGH/completeness): delta spec に "Agent and environment selection" と "Custom Tool included in session creation" の scenario が復元された

### Regressions
なし

### Unchanged Issues
- Finding #2 (LOW/consistency): tasks.md 1.1 の「Given/When/Then 形式」と 1.2 の `**WHEN**/**THEN**` 表記の混在は残るが、design.md D2 で「propose-system.ts 内の既存 scenario フォーマットに合わせる」と明記されており implementer の解釈に実害なし

### Convergence Trend
`improving` — HIGH 1 件が解消、新たな regression なし

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | tasks.md:3 | Task 1.1 で「Given/When/Then 形式」と書いているが、Task 1.2 および design.md D2 の具体例は `**WHEN**/**THEN**`（GIVEN なし）。既存 spec のフォーマットは WHEN/THEN なので Task 1.2 が正しいが、用語の不一致がある | 実害なし。implementer は 1.2 の具体例に従うため対応不要 |

## Checklist

- [x] proposal.md の Why / What Changes / Capabilities / Impact が揃っている
- [x] design.md の Goals が request の要件をカバーしている
- [x] design.md の Non-Goals が適切にスコープを絞っている
- [x] design.md の Decisions に理由がある
- [x] tasks.md が request の受け入れ基準を全て網羅している
- [x] delta spec のファイル配置が `specs/<capability-name>/spec.md` 形式
- [x] delta spec の capability-name (`propose-session`) が `openspec/specs/` 配下に存在する
- [x] delta spec が `## MODIFIED Requirements` を使用（既存 Requirement の変更のため正しい）
- [x] `### Requirement:` header が既存 spec の header と完全一致している
- [x] 全 scenario が保持されている（既存 3 + 新規 2 = 計 5）
- [x] proposal.md の Modified Capabilities と delta spec の対象が一致
- [x] セキュリティ影響なし（プロンプト文字列の修正のみ、認証・入力検証・API 変更なし）
