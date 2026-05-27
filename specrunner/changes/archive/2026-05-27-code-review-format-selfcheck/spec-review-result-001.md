# Spec Review: code-review-format-selfcheck

- **verdict**: approved

## Summary

単一プロパティ追加（`followUpPrompt`）の bug-fix。スコープが明確で、設計パターンは design.ts で実証済み。

## Findings

| # | Severity | Category | File | Description | How to Fix | Fix |
|---|----------|----------|------|-------------|------------|-----|
| 1 | LOW | Completeness | tasks.md | followUpPrompt 内で "出力した review-feedback ファイル" とだけ書かれており、ファイルパスの解決方法が明示されていない。ただし同一 session 内で agent がファイルを書いているため、コンテキストから自明。運用上の問題なし | 実装時に注記として「直前の buildMessage で指定した findingsPath と同一パス」を添えても良いが必須ではない | no |

## Review Notes

### 設計整合性

- `followUpPrompt?: string` は `types.ts` L180 で定義済み ✓
- executor.ts L138 の `step.getFollowUpPrompt?.(state, deps) ?? step.followUpPrompt` で自動ピックアップ ✓
- executor 側の変更不要（design 通り）✓

### Spec フォーマット

- delta-spec-validation-result.md: approved ✓
- `specs/code-review-step/spec.md` — MUST キーワード、Scenario Given/When/Then 形式、テーブル形式、全確認項目の網羅 ✓

### スコープ制限の遵守

- PIPELINE_RULES 変更なし ✓
- `parseFixableFindings` 変更なし ✓
- verdict CLI 側再計算なし ✓

### セキュリティ

- 文字列プロパティの追加のみ。認証・入力バリデーション・OWASP 関連の懸念なし。

### maxTurns

現在 `maxTurns: 20`。followUpPrompt の self-check pass は Read + 条件次第で Write の 1–2 ターン追加。既存のコードレビュー本体が数ターンで収まる前提なら余裕あり。実装検証（Task 2）で確認される。
