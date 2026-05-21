## Why

`specrunner create` は Claude Agent SDK で対話 REPL を自前実装しており、約 1,400 行のコードで Claude Code が既に提供する対話 UI を劣化コピーしている。SDK の `tool_use_summary` 未emit、スピナー状態管理の脆弱性、`FINAL_DRAFT` マーカーの文字列マッチ依存など、構造的な問題を抱える。

Local Runtime ユーザーは Claude Code を持っているため対話 UI を自前で組む必要がなく、specrunner create の本質的責務は「request.md の生成支援」であり「対話 UI の提供」ではない。テンプレート出力とバリデーションに特化した `request` サブコマンドグループに再編する。

## What Changes

- `specrunner request template [--type <type>]` を新設し、type に応じた request.md テンプレートを stdout に出力する
- `specrunner request validate <file>` を新設し、request.md のフォーマット検証を提供する
- `specrunner create` コマンドとその依存ファイル群（6 ソース + 6 テスト、計 ~1,300 行）を削除する
- `isToolUseStart` 型ガードを message-types.ts から削除する（create-dialog のみが使用）
- `bin/specrunner.ts` のコマンド登録と USAGE を更新する

## Capabilities

### New Capabilities

(none — `request template` と `request validate` は cli-commands spec への追加)

### Modified Capabilities

- `cli-commands`: `create` コマンドの Requirements を削除し、`request template` / `request validate` の Requirements を追加

## Impact

- `bin/specrunner.ts`: `create` case 削除 + `request` case 追加 + USAGE 文字列更新
- `src/cli/create.ts`: 削除
- `src/cli/spinner.ts`: 削除
- `src/core/command/create.ts`: 削除（`buildScaffoldTemplate()` は `src/core/command/request.ts` に移動）
- `src/core/command/create-dialog.ts`: 削除
- `src/prompts/create-dialog.ts`: 削除
- `src/state/draft-store.ts`: 削除
- `src/core/command/request.ts`: 新規作成（template + validate コアロジック）
- `src/cli/request.ts`: 新規作成（CLI facade）
- `src/adapter/claude-code/message-types.ts`: `isToolUseStart` 関数を削除
- テストファイル: 6 件削除 + 新規テスト追加 + message-types テスト部分削除
