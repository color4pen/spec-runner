# Implementation Notes: fix-create-dialog-repl-timing

- **result**: completed
- **tasks_completed**: 22/22
- **date**: 2026-05-08

## Summary

`createPromptGenerator()` + `queryInteractive()` の generator 方式を廃止し、while ループで毎ターン `runtime.query()` を独立呼び出しする方式に書き換えた。LLM 応答完了後に `rl.question("> ")` を呼ぶことで、readline とストリーミングの競合を構造的に解消している。

## Files Modified

| File | Operation | Description |
|------|-----------|-------------|
| `src/core/command/create-dialog.ts` | modified | generator 方式を廃止、while ループ + `runtime.query()` per turn に書き換え。`isLocalRuntime()` ガード追加。`createPromptGenerator`, `ReadlineInterface`, `RuntimeWithQueryInteractive`, `hasQueryInteractive`, `pendingAutoMessage` を削除。`processAssistantTurn()` で phase 境界維持 |
| `src/core/runtime/local.ts` | modified | `queryInteractive()` メソッド削除、`sdkQueryFn` フィールド削除、`LocalRuntimeOptions.sdkQueryFn` 削除、`SdkQueryFn`/`SDKUserMessage`/`Query` の import 削除 |
| `src/core/runtime/strategy.ts` | modified | `RuntimeStrategy` interface から `queryInteractive?()` メソッド削除 |
| `src/adapter/claude-code/agent-runner.ts` | modified | `SdkQueryFn` 型削除、`Query` import 削除 |
| `tests/unit/core/command/create-dialog.test.ts` | modified | TC-CD-005〜TC-CD-009 削除、TC-CD-011〜TC-CD-014 追加（新しい dialog loop テスト）。`vi.mock("readline/promises")` をモジュールトップレベルで使用 |
| `tests/unit/core/command/create-polish-and-resume.test.ts` | modified | TC-PR-005/TC-PR-006 を `LocalRuntime` + mock `queryFn` ベースに書き換え（`queryInteractive` → `runtime.query()` ベース） |
| `tests/unit/core/runtime/local.test.ts` | modified | TC-LR-014 (`queryInteractive` テスト) 削除、`SdkQueryFn` import 削除 |
| `openspec/changes/fix-create-dialog-repl-timing/tasks.md` | modified | 全タスクを `[x]` に更新 |

## Key Design Decisions

### session_id の取得タイミング
SDK の `query()` は `stream_event` → `assistant` → `result` の順でメッセージを emit する。`result` メッセージに `session_id` が含まれるため、`processAssistantTurn()` は `assistant` メッセージで処理を行った後も iterator を exhausted まで続け、`result` から `session_id` を取得する。

### `hasAssistantMessage` フラグ
`sessionEnded` の代わりに `hasAssistantMessage` で「LLM がコンテンツを生成したか」を判定。これにより、SDK が assistant なしで result のみ返す（予期せぬ終了）場合に dialog loop を停止できる。

### ManagedRuntime ガード
`hasQueryInteractive()` の代わりに `runtime instanceof LocalRuntime` による `isLocalRuntime()` ガードを採用（tasks 2.2 の推奨案）。

## Blocked Tasks

なし。全タスク完了。
