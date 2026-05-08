# Design: create 対話 REPL でツール使用表示が出ない問題を修正する

## Context

`message-types.ts` に 4 つの型ガードがある: `isResultMessage`, `isStreamEvent`, `isTextDelta`, `isToolUseSummary`。`consumeStream()` はこれらを使って SDK メッセージを分類し、I/O side-effect を実行する。

`isToolUseSummary()` は `type: "tool_use_summary"` を待つが、SDK はこのメッセージを emit しない。ツール使用情報は `stream_event` 内の `content_block_start` イベントとして流れる。

## Goals

1. 実際に SDK が emit するイベント形式でツール使用を検出する
2. dead code を除去してメンテナンス負荷を下げる

## Non-Goals

- ツール実行結果・実行時間の表示
- `tool_progress` メッセージへの対応（SDK が emit していない）

## Decisions

### D1: `content_block_start` の `tool_use` ブロックを検出する

**問題**: SDK は `tool_use_summary` を emit しないが、ツール使用情報は `stream_event` 内に存在する。

**方針**: `isToolUseStart()` 型ガードを新設。`isStreamEvent(v)` を前提とし、`event.type === "content_block_start"` かつ `event.content_block.type === "tool_use"` を検査する。戻り型で `event.content_block.name: string` まで narrow する。

**理由**: `isTextDelta()` と同じパターン（`isStreamEvent` ベースの nested 型ガード）を踏襲することで、型ガード群の一貫性を維持する。

```typescript
export function isToolUseStart(
  v: unknown,
): v is {
  type: "stream_event";
  event: {
    type: "content_block_start";
    content_block: { type: "tool_use"; name: string };
  };
} {
  if (!isStreamEvent(v)) return false;
  const event = v.event;
  if (event["type"] !== "content_block_start") return false;
  const cb = event["content_block"];
  if (typeof cb !== "object" || cb === null) return false;
  return (
    (cb as Record<string, unknown>)["type"] === "tool_use" &&
    typeof (cb as Record<string, unknown>)["name"] === "string"
  );
}
```

### D2: `consumeStream()` の分岐差し替え

**問題**: `isToolUseSummary(msg)` 分岐は到達不能コード。

**方針**: `isToolUseStart(msg)` に差し替え。出力を `[tool] ${msg.event.content_block.name}` に変更。spinner の挙動（stop のみ、restart なし）は維持。

```typescript
} else if (isToolUseStart(msg)) {
  spinner.stop();
  process.stderr.write(`\n[tool] ${msg.event.content_block.name}\n`);
}
```

**理由**: `msg.summary`（自由テキスト）から `msg.event.content_block.name`（ツール名のみ）に変わるが、元々 summary が届かなかったので情報量は純増。

### D3: `isToolUseSummary` の完全削除

**問題**: SDK が emit しない型に対する dead code が残る。

**方針**: `message-types.ts` から `isToolUseSummary` 関数を削除。`create-dialog.ts` の import から除去。テスト（TC-MT-005, TC-CD-016）を `isToolUseStart` 用に書き換え。

**理由**: 必要になれば git history から復元可能。dead code を残すと「動いている」という誤認を招く。

## テスト戦略

### message-types.test.ts

TC-MT-005 を `isToolUseStart()` 用に書き換え:
- valid: `content_block_start` + `tool_use` + `name: string` → true
- reject: `content_block_start` + `tool_use` + name 欠落 → false
- reject: `content_block_start` + 非 `tool_use` → false
- reject: 非 `content_block_start` → false
- reject: 非 stream_event → false

### create-dialog.test.ts

TC-CD-016 を書き換え:
- mock が `content_block_start` + `tool_use` を yield → stderr に `[tool] Read` が出力される
- import の `isToolUseSummary` → `isToolUseStart` に更新
- 行 138-146 の inline type guard テストも `isToolUseStart` に更新
