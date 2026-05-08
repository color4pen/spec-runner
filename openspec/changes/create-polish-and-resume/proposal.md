# create の対話セッション再開と slug 生成の対話化

## Why

R1（interactive-query-foundation, PR #128）で `queryInteractive()` の対話基盤を、R2（interactive-create-dialog, PR #129）で対話 REPL 本体を整備した。しかし R2 では以下が known limitation として残っている:

- Ctrl+C で中断した対話を再開する手段がない（draft は保存されるが復帰パスがない）
- slug は事前に `--slug` か `slugify(description)` で決定済み。LLM との対話で適切な slug を導出する手段がない
- 1-shot create のコード（`extractRequestContent()`, `buildCreateSystemPrompt()`）が対話モードのデフォルト化後もデッドコードとして残っている
- `--run` フラグが対話モードで未対応（TODO コメント）

本変更でこれらを解消し、`specrunner create` の対話モードを完成させる。

## What Changes

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `bin/specrunner.ts` | `--resume <slug>` フラグ追加。resume 時は description を optional に |
| `src/cli/create.ts` | `CreateOptions` に `resume` 追加。ルーティング変更 |
| `src/core/command/create.ts` | `extractRequestContent()` 削除。`executeCreate()` を `--no-llm` 専用ファサードに縮小 |
| `src/core/command/create-dialog.ts` | `--resume` 復帰ロジック、slug 対話生成、Ctrl+C ハンドリング、`--run` 対応 |
| `src/prompts/create-dialog.ts` | slug 提案指示の追加、resume 用初回メッセージ |
| `src/prompts/create-system.ts` | ファイル削除（`buildCreateSystemPrompt()`, `buildCreateUserMessage()` 全廃） |

### テストファイル

| ファイル | 変更内容 |
|---------|---------|
| `tests/unit/core/command/create-dialog.test.ts` | resume / slug proposal / SIGINT テスト追加 |
| `tests/unit/core/command/create.test.ts` | `extractRequestContent()` テスト削除、`--no-llm` 動作確認 |
| `tests/unit/prompts/create-dialog.test.ts` | slug 提案指示 / resume prompt テスト追加 |

## Capabilities

### New Capabilities

- **セッション再開**: `--resume <slug>` で中断した対話を再開（hot resume + cold start の 2 層）
- **slug 対話生成**: LLM が `<!-- SLUG_PROPOSAL: <slug> -->` マーカーで slug を提案し、ユーザーが承認/拒否
- **Ctrl+C ドラフト保存**: SIGINT 捕捉で draft を永続化してから終了

### Modified Capabilities

- **executeCreate()**: 1-shot LLM パスを削除し `--no-llm` 専用ファサードに縮小
- **--run**: 対話モードでも finalize 後に pipeline 実行を確認/自動実行

## Impact

- `src/prompts/create-system.ts` が完全に削除される。import している `src/core/command/create.ts` の修正が必須
- `DialogParams.slug` が optional になることで、slug 未確定フェーズの状態管理が追加される
- `bin/specrunner.ts` の create 引数パースが変更される（`--resume` 追加、description の optional 化）
