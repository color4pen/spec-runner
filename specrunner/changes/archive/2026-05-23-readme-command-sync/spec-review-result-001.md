# Spec Review Result: readme-command-sync

- **verdict**: approved

## 検証サマリー

doc-only の bug-fix。コード変更なし、セキュリティ考慮事項なし。

## 実機照合

`src/cli/command-registry.ts` の `USAGE` 定数（L54-83）と design.md の差分一覧を突き合わせた結果、すべての主張が正確。

| 主張 | 実コード | 一致 |
|---|---|---|
| `request show` / `request rm` は USAGE に存在しない | USAGE L56-62 に記載なし | ✓ |
| `job cancel <jobId>` が正しい表記 | USAGE L68 に `job cancel <jobId>` あり | ✓ |
| `job rm` は USAGE に存在しない | USAGE L64-70 に記載なし | ✓ |

## 仕様整合性

- **request.md** → **design.md** → **tasks.md** の要件・設計・タスクが 1:1 で対応。
- 修正対象は `README.md` のみ。scope 外のコード・spec への言及なし。
- managed Quick Start の修正順序（`init` → `login` → `export SPECRUNNER_API_KEY` → `runtime setup`）は論理的に正当。
- Task 5 の `bun run typecheck && bun run test` green 確認は README-only 変更として適切。

## 別 issue 候補（スコープ外として正しく処理済み）

`init.ts:16` のエラーメッセージが `managed setup` と案内している一方、実コマンドは `runtime setup`。request.md でスコープ外と明示されており、本件の受け入れ基準に影響なし。

## セキュリティ

変更対象は静的ドキュメントのみ。セキュリティ上の懸念なし。
