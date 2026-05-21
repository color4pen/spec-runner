# Spec Review Result

- **change**: adr-numbering-removal
- **date**: 2026-05-19
- **reviewer**: spec-reviewer
- **verdict**: approved

## Summary

問題・設計・タスク・delta spec の全アーティファクトが整合している。実装上のリスクは低い。

## Findings

### ✅ 問題の実証

`specrunner/adr/` に `ADR-0004-2026-05-19-*.md` が 2 件並存していることを実ファイルで確認。request.md の観測が事実に基づいている。

### ✅ 採番ロジックの所在

`src/prompts/adr-gen-system.ts` L46–48 に旧命名規則と採番手順が存在することを確認。tasks.md が指定する変更箇所が正確。

### ✅ ADR 内部参照の把握

grep 結果:
- `ADR-0003-*.md` L1: `# ADR-0001:` （ファイル番号と見出し番号が不一致）
- `ADR-0004-*baseline-header*.md` L1: `# ADR-0004:`

design.md・tasks.md の記述と一致。クリーンアップ対象が正しく特定されている。

### ✅ delta spec ヘッダー一致

baseline `specrunner/specs/adr-generation/spec.md` の Requirement ヘッダー:

```
### Requirement: judge=yes produces an ADR file
```

delta spec の MODIFIED ヘッダーと完全一致。`Numbering` サブ行が delta spec から消えることで削除が明示される。

### ✅ スコープ境界

- `specrunner/changes/archive/` / `specrunner/requests/merged/` の旧参照は touch しない方針が明記されており適切。
- `src/core/step/code-review.ts:83` の `ADR-20260430-review-exit-contract` は openspec-workflow 側の参照であり、本 request の命名変更とは無関係。除外判断が正確。

### ✅ セキュリティ

変更はプロンプト文字列の書き換えとファイルリネームのみ。認証・入力バリデーション・OWASP 対象箇所への影響なし。既存の prompt injection 防御（`<user-request>` タグ境界）は変更されない。

### ✅ テスト影響

ADR 命名固有の unit test が存在しないことを tasks.md が述べており、`src/prompts/adr-gen-system.ts` はプロンプトテキストのみのため型チェックが通れば十分。`bun run typecheck && bun run test` の受け入れ基準は適切。

## Observations（非ブロッキング）

1. `ADR-0003` の見出しが `# ADR-0001:` になっている（既存ファイルのミス）。tasks.md Task 3 で正しく検出・修正対象に含まれている。

2. delta spec は `## MODIFIED Requirements` のみで `## DELETED` セクションを持たない。`Numbering` 行の削除は MODIFIED 配下に含まれない形で消えるが、tasks.md L11–12 で明示されているため実装者が見落とすリスクは低い。

## Verdict

- **verdict**: approved
