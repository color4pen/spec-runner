# create 対話 REPL でツール使用表示が出ない問題を修正する

## Meta

- **type**: bug-fix
- **slug**: fix-create-tool-display

## 背景

`specrunner create` の対話 REPL で `[tool]` 表示が一切出ない。issue #135 のデバッグで原因が判明した。

### 原因

`consumeStream()` は `isToolUseSummary()` で `type: "tool_use_summary"` のメッセージを待つが、Claude Agent SDK (`@anthropic-ai/claude-agent-sdk@^0.2.128`) はこの型を `.d.ts` に定義しているものの、実際の `.mjs` ソースに emit ロジックが存在しない。全セッション通じて `tool_use_summary` メッセージは一度も出現しない。

### デバッグ結果

`consumeStream` の `for await` ループに全メッセージの type を出力するデバッグログを追加して確認:

- `stream_event`: 正常に出現（text_delta 含む）
- `assistant`: 正常に出現（ターン完了時）
- `result`: 正常に出現（セッション完了時）
- `system`, `user`, `rate_limit_event`: 出現
- **`tool_use_summary`: 一度も出現しない**
- **`tool_progress`: 一度も出現しない**

ツール使用は `stream_event` として流れる。API の `content_block_start` イベント（`content_block.type === "tool_use"`）にツール名が含まれる。

## 要件

### 1. ツール使用検出の修正

1. `src/adapter/claude-code/message-types.ts` に `isToolUseStart()` 型ガードを追加する。`stream_event` のうち `event.type === "content_block_start"` かつ `event.content_block.type === "tool_use"` を検出する

2. `consumeStream()` で `isToolUseStart()` にマッチした場合、`event.content_block.name` から `[tool] {name}` を stderr に出力する

3. `isToolUseSummary()` を `message-types.ts` から削除する。SDK が emit しない dead code であり、必要になれば git history から復元可能。`consumeStream` の import と分岐も削除する

### 2. デバッグログの削除

4. `consumeStream()` の JSDoc（行185-187）の `tool_use_summary` 記述を `content_block_start (tool_use)` に更新する

5. `consumeStream()` に追加した `console.error(\`[debug] msg type: ...\`)` を削除する

## スコープ外

- ツール実行結果の表示
- ツール実行時間の表示
- `tool_progress` メッセージへの対応（現時点で SDK が emit していない）

## 受け入れ基準

- [ ] `specrunner create` でツール使用時に `[tool] Read` 等の表示が stderr に出る
- [ ] デバッグログが削除されている
- [ ] `bun run typecheck && bun run test` が green


---

> **Note**: This request was archived before the change-folder format was introduced.
> Only `request.md` is preserved; design / tasks / delta-specs are not available.
> Migrated from `specrunner/requests/merged/fix-create-tool-display.md` by `merged-to-archive-consolidation`.
