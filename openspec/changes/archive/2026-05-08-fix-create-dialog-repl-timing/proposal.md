# create 対話 REPL を continue: true ループに切り替える

## Why

PR #129-#130 で実装した `specrunner create` の対話 REPL が正常に動作しない。SDK の `query()` に `AsyncIterable<SDKUserMessage>` generator を渡す方式では、SDK が generator から次のメッセージを pre-pull するため、`rl.question("> ")` が LLM 応答完了前に呼ばれる。readline プロンプトと LLM のストリーミング出力が混在し、表示が壊れる。

根本原因は generator 方式と readline の構造的な不整合であり、毎ターン独立した `query()` 呼び出しに切り替えて LLM 応答と入力を直列化する必要がある。

## What Changes

| ファイル | 変更内容 |
|---------|---------|
| `src/core/command/create-dialog.ts` | generator 方式を廃止し、while ループで毎ターン `runtime.query()` を呼ぶ方式に書き換え。`createPromptGenerator()` / `hasQueryInteractive()` / `RuntimeWithQueryInteractive` を削除 |
| `src/core/runtime/local.ts` | `queryInteractive()` メソッドを削除。`sdkQueryFn` フィールドを削除 |
| `src/core/runtime/strategy.ts` | `RuntimeStrategy.queryInteractive?()` を削除 |
| `src/adapter/claude-code/agent-runner.ts` | `SdkQueryFn` 型を削除 |
| `tests/unit/core/command/create-dialog.test.ts` | `createPromptGenerator` / `hasQueryInteractive` のテストを削除し、新しい dialog loop のテストに置き換え |

## Capabilities

### Modified Capabilities

- `cli-commands`: `specrunner create` の対話 REPL が正常動作するようになる。表示の競合が解消

### Removed Capabilities

- `queryInteractive()`: RuntimeStrategy からメソッドごと削除。呼び出し元がなくなる dead code

## Impact

- `create-dialog.ts` の `executeCreateDialog()` が大幅に書き換わる（generator → while ループ）
- `LocalRuntime` から `queryInteractive()` と `sdkQueryFn` が削除される
- `RuntimeStrategy` interface から `queryInteractive?()` が削除される
- `SdkQueryFn` 型が削除される
- session 管理が暗黙的（generator + SDK 内部 session）から明示的（`session_id` 追跡 + `resume` オプション）に変わる
