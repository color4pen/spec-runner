# Spec Review Result: test-case-gen-prompt (Iteration 1)

- **reviewer**: spec-reviewer
- **verdict**: approved
- **date**: 2026-05-09

## Summary

6 要件すべてが proposal → design → tasks で一貫してトレースされている。変更対象ファイルが少なく（prompt ファイル 1 + step ファイル 1 + テスト 1）、パイプライン構造への影響がない prompt-only 変更として妥当。`deps.request.enabled` は既存の `ParsedRequest` 型に存在しており、型整合性に問題なし。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | MEDIUM | consistency | proposal.md:43 | Scope OUT に `src/core/step/test-case-gen.ts (step 定義の変更なし)` と記載されているが、design.md D5 と tasks.md T-3 はこのファイルの `buildMessage` 変更を要求している。スコープ表記と実際の変更対象が矛盾 | proposal.md の Scope IN に `src/core/step/test-case-gen.ts (buildMessage のパラメータ追加のみ)` を追加し、OUT から除外する |
| 2 | LOW | consistency | tasks.md:161 | T-4 point 5 「`makeMinimalDeps` に `enabled: []` を追加」と記載されているが、既存テストの `makeMinimalDeps` には既に `enabled: []` が存在する。実装者に不要な作業を指示 | 「`enabled: []` が既に存在することを確認」に文言修正するか、この項目を削除 |
| 3 | LOW | completeness | design.md:64-68,127-134 | D4 (Blocked Reasons セクション) と D6 (Result セクション内の `blocked_reasons`) が同じ情報を二重に出力する設計。両者の関係（D4 は詳細散文、D6 は集計値）が明示されていない | D6 の `blocked_reasons` フィールドの説明に「D4 Blocked Reasons セクションの件数集計」等の関係を追記 |

## Requirement Traceability

| Request Requirement | Proposal | Design | Tasks | Status |
|---------------------|----------|--------|-------|--------|
| Category 付与 | Approach 1 | D1, D2 | T-1 sec.1-2 | Covered |
| Source 記録 | Approach 2 | D1 | T-1 sec.1 | Covered |
| Summary セクション | Approach 3 | D3 | T-1 sec.3 | Covered |
| blocked_reasons | Approach 4 | D4 | T-1 sec.5 | Covered |
| must-areas | Approach 5 | D5 | T-1 sec.7, T-2, T-3 | Covered |
| 構造化戻り値 | Approach 6 | D6 | T-1 sec.6 | Covered |

## Security Assessment

- `<must-areas>` セクションは `enabled` 配列（request.md 由来）からユーザーメッセージに注入される。既存の `<user-request>` タグと同様にデータとして扱われ、system prompt の Security Note がカバーしている
- prompt injection リスクは LOW（`enabled` の値が test-case 生成の Priority 判定にのみ使用される）
- OWASP Top 10 該当なし（prompt テンプレート変更のみ、外部入力の永続化なし）
