# Spec Review Result: fix-ghost-job-status

- **iteration**: 1
- **date**: 2026-05-11
- **verdict**: approved

## Summary

設計は root cause を正確に特定し、既存の `JobStateStore.fail()` API を再利用する最小限の修正方針を採っている。変更対象ファイルは 1 本（+ テスト 1 本）、blast radius は小さい。

## Findings

| # | Severity | Category | File | Description | How to Fix |
|---|----------|----------|------|-------------|------------|
| 1 | LOW | consistency | request.md:33 | AC の「base-branch 未指定」は preflight で弾かれるため ghost job を生まない。design.md が正しく指摘しているが、AC 側の例示が不正確 | request.md の AC1 を「setupWorkspace が失敗した場合に job status が failed になる」等の実際のトリガーに書き換えるか、design.md の Clarification をそのまま残して対応とする |

## Completeness

- 要件 1〜3 は design.md の Affected Error Paths テーブルと Tasks 1〜3 で網羅されている
- AC 4 項目のうち 3 項目（ghost job 解消、正常 pipeline 無影響、typecheck/test pass）は Tasks 4〜5 で検証可能
- AC 1 は上記 Finding #1 の通り例示が不正確だが、design.md の Clarification セクションで明示的に言及・解決済み

## Consistency

- `JobStateStore.fail()` は `executor.ts` / `pipeline.ts` で既に確立されたパターン。新規抽象なし
- `"running" → "failed"` は `VALID_TRANSITIONS`（lifecycle.ts:37）で有効な遷移
- `"No Delta Spec Required"` の判断は妥当 — 既存 spec の fail() セマンティクスと exit code 1 の仕様内

## Feasibility

- 変更は runner.ts の 2 箇所の catch ブロック + 1 箇所の defensive guard。既存コードの構造変更なし
- テスト計画（TC-CR-009〜011）は setupWorkspace 失敗、pipeline throw、safety net 既発火の 3 パターンをカバー
- Task 3 の defensive guard（disk state 読み直し）は belt-and-suspenders として妥当。`store.load()` 失敗は catch で握りつぶすため二次障害リスクなし

## Security

該当なし。状態ファイルの書き込み先は既存の XDG state directory で、新たな attack surface の追加なし。
