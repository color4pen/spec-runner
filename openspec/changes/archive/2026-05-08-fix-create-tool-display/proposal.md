# Proposal: create 対話 REPL でツール使用表示が出ない問題を修正する

## 問題の本質

`specrunner create` の対話 REPL で `[tool]` 表示が一切出ない。`consumeStream()` は `isToolUseSummary()` で `type: "tool_use_summary"` のメッセージを待つが、Claude Agent SDK (`@anthropic-ai/claude-agent-sdk@^0.2.128`) はこの型を `.d.ts` に定義しているものの、実際の `.mjs` ソースに emit ロジックが存在しない。全セッション通じて `tool_use_summary` メッセージは一度も出現しない。

ツール使用情報は `stream_event` として流れており、API の `content_block_start` イベント（`content_block.type === "tool_use"`）にツール名が含まれる。

## 提案する修正

### 1. `isToolUseSummary()` を `isToolUseStart()` に置き換え

`message-types.ts` から dead code の `isToolUseSummary()` を削除し、`stream_event` の `content_block_start` + `content_block.type === "tool_use"` を検出する `isToolUseStart()` を追加する。

### 2. `consumeStream()` の分岐を差し替え

`isToolUseSummary(msg)` 分岐を `isToolUseStart(msg)` に変更し、`event.content_block.name` から `[tool] {name}` を stderr に出力する。

### 3. JSDoc とデバッグログの整理

JSDoc 内の `tool_use_summary` 記述を `content_block_start (tool_use)` に更新。デバッグログがあれば削除。

## 影響範囲

- **変更ファイル**:
  - `src/adapter/claude-code/message-types.ts`: `isToolUseSummary` 削除 → `isToolUseStart` 追加
  - `src/core/command/create-dialog.ts`: import 変更 + `consumeStream` 内の分岐差し替え + JSDoc 更新
  - `tests/unit/adapter/claude-code/message-types.test.ts`: TC-MT-005 を `isToolUseStart` 用に書き換え
  - `tests/unit/core/command/create-dialog.test.ts`: import 変更 + TC-CD-016 を `content_block_start` 用に書き換え

- **既存機能への影響**: なし。`isToolUseSummary` は SDK が emit しない dead code であり、削除しても動作に変化はない
- **後方互換性**: 破壊的変更なし

## 受け入れ基準

- [ ] `specrunner create` でツール使用時に `[tool] Read` 等の表示が stderr に出る
- [ ] デバッグログが削除されている
- [ ] `bun run typecheck && bun run test` が green
