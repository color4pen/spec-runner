# Tasks: create 対話 REPL でツール使用表示が出ない問題を修正する

## T1: message-types.ts — `isToolUseSummary` 削除 + `isToolUseStart` 追加

**File**: `src/adapter/claude-code/message-types.ts`

**Changes**:
1. Lines 65-78 の `isToolUseSummary` 関数を削除する
2. 同じ位置に `isToolUseStart` 関数を追加する

**`isToolUseStart` の実装**:
```typescript
/**
 * Type guard for a tool_use content_block_start within a stream_event.
 * Checks: event.type === "content_block_start" && event.content_block.type === "tool_use".
 * Narrows to a shape where event.content_block.name is a string.
 */
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

---

## T2: create-dialog.ts — import + consumeStream 分岐 + JSDoc 更新

**File**: `src/core/command/create-dialog.ts`

### T2.1: import 変更

**Location**: Line 29

**修正前**:
```typescript
import { isStreamEvent, isTextDelta, isToolUseSummary, isResultMessage } from "../../adapter/claude-code/message-types.js";
```

**修正後**:
```typescript
import { isStreamEvent, isTextDelta, isToolUseStart, isResultMessage } from "../../adapter/claude-code/message-types.js";
```

### T2.2: consumeStream の分岐差し替え

**Location**: Line 206-208

**修正前**:
```typescript
      } else if (isToolUseSummary(msg)) {
        spinner.stop();
        process.stderr.write(`\n[tool] ${msg.summary}\n`);
```

**修正後**:
```typescript
      } else if (isToolUseStart(msg)) {
        spinner.stop();
        process.stderr.write(`\n[tool] ${msg.event.content_block.name}\n`);
```

### T2.3: JSDoc 更新

**Location**: Lines 179-187

**修正前**:
```typescript
/**
 * Consume all SDK messages from a single query() call, handling I/O side-effects:
 *   - text_delta: stop spinner, write text to stdout, accumulate in textBuffer
 *   - tool_use_summary: stop spinner, write "[tool] summary" to stderr
 *   - assistant message: stop spinner, write newline, call onAssistantComplete callback
 *   - result message: capture session_id and break
 *
 * The spinner is NOT restarted after tool_use_summary (chatter prevention).
 * The try/finally ensures spinner.stop() is called even on exception.
 */
```

**修正後**:
```typescript
/**
 * Consume all SDK messages from a single query() call, handling I/O side-effects:
 *   - text_delta: stop spinner, write text to stdout, accumulate in textBuffer
 *   - content_block_start (tool_use): stop spinner, write "[tool] name" to stderr
 *   - assistant message: stop spinner, write newline, call onAssistantComplete callback
 *   - result message: capture session_id and break
 *
 * The spinner is NOT restarted after tool_use display (chatter prevention).
 * The try/finally ensures spinner.stop() is called even on exception.
 */
```

### T2.4: デバッグログ削除

`consumeStream` 内に `console.error(`[debug] msg type:` 等のデバッグログが残っていれば削除する。現時点で main branch 上にはないが、作業ブランチに残っている可能性がある。

---

## T3: message-types.test.ts — TC-MT-005 書き換え

**File**: `tests/unit/adapter/claude-code/message-types.test.ts`

### T3.1: import 変更

**Location**: Line 15

**修正前**:
```typescript
  isToolUseSummary,
```

**修正後**:
```typescript
  isToolUseStart,
```

### T3.2: TC-MT-005 テストケース書き換え

**Location**: Lines 166-198

TC-MT-005 のブロック全体を以下に置き換え:

```typescript
// ---------------------------------------------------------------------------
// TC-MT-005: isToolUseStart()
// ---------------------------------------------------------------------------

describe("TC-MT-005: isToolUseStart() type guard", () => {
  it("returns true for a valid content_block_start with tool_use", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read" },
      },
    };
    expect(isToolUseStart(msg)).toBe(true);
  });

  it("returns true for empty string name", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "" },
      },
    };
    expect(isToolUseStart(msg)).toBe(true);
  });

  it("returns false when content_block.type is not tool_use", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "text", text: "hello" },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when content_block.name is missing", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use" },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when content_block.name is not a string", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: 42 },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when event.type is not content_block_start", () => {
    const msg = {
      type: "stream_event",
      event: {
        type: "content_block_delta",
        delta: { type: "text_delta", text: "hi" },
      },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false when content_block is null", () => {
    const msg = {
      type: "stream_event",
      event: { type: "content_block_start", content_block: null },
    };
    expect(isToolUseStart(msg)).toBe(false);
  });

  it("returns false for non-stream-event messages", () => {
    expect(isToolUseStart({ type: "result", subtype: "success" })).toBe(false);
    expect(isToolUseStart(null)).toBe(false);
    expect(isToolUseStart(undefined)).toBe(false);
  });
});
```

---

## T4: create-dialog.test.ts — import + TC-CD-016 書き換え

**File**: `tests/unit/core/command/create-dialog.test.ts`

### T4.1: import 変更

**Location**: Line 26

**修正前**:
```typescript
import { isTextDelta, isStreamEvent, isToolUseSummary } from "../../../../src/adapter/claude-code/message-types.js";
```

**修正後**:
```typescript
import { isTextDelta, isStreamEvent, isToolUseStart } from "../../../../src/adapter/claude-code/message-types.js";
```

### T4.2: inline type guard テスト書き換え

**Location**: Lines 138-146

**修正前**:
```typescript
  it("isToolUseSummary identifies tool_use_summary messages", () => {
    const toolSummary = { type: "tool_use_summary", summary: "Read: src/foo.ts" };
    expect(isToolUseSummary(toolSummary)).toBe(true);
  });

  it("isToolUseSummary rejects non-summary messages", () => {
    expect(isToolUseSummary({ type: "stream_event" })).toBe(false);
    expect(isToolUseSummary({ type: "tool_use_summary" })).toBe(false); // missing summary field
    expect(isToolUseSummary(null)).toBe(false);
  });
```

**修正後**:
```typescript
  it("isToolUseStart identifies content_block_start tool_use messages", () => {
    const toolStart = {
      type: "stream_event",
      event: {
        type: "content_block_start",
        content_block: { type: "tool_use", name: "Read" },
      },
    };
    expect(isToolUseStart(toolStart)).toBe(true);
  });

  it("isToolUseStart rejects non-tool-use messages", () => {
    expect(isToolUseStart({ type: "stream_event", event: { type: "content_block_delta" } })).toBe(false);
    expect(isToolUseStart({ type: "result", subtype: "success" })).toBe(false);
    expect(isToolUseStart(null)).toBe(false);
  });
```

### T4.3: TC-CD-016 書き換え

**Location**: Lines 526-555

**修正前**:
```typescript
// TC-CD-016: consumeStream — tool_use_summary written to stderr
// ...
describe("TC-CD-016: consumeStream — tool_use_summary written to stderr", () => {
  it("writes [tool] summary line to stderr on tool_use_summary", async () => {
    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      yield { type: "tool_use_summary", summary: "Read: src/foo.ts" };
      yield { type: "result", subtype: "success", session_id: "s-cd-016" };
    }
```

**修正後**:
```typescript
// TC-CD-016: consumeStream — tool_use content_block_start written to stderr
// ...
describe("TC-CD-016: consumeStream — tool_use content_block_start written to stderr", () => {
  it("writes [tool] name to stderr on content_block_start tool_use", async () => {
    async function* mockQueryFn(_params: { prompt: string | AsyncIterable<unknown>; options?: Record<string, unknown> }) {
      yield {
        type: "stream_event",
        event: {
          type: "content_block_start",
          content_block: { type: "tool_use", name: "Read" },
        },
      };
      yield { type: "result", subtype: "success", session_id: "s-cd-016" };
    }
```

**stderr assertion 変更** (Line 553):

**修正前**:
```typescript
    expect(output).toContain("[tool] Read: src/foo.ts");
```

**修正後**:
```typescript
    expect(output).toContain("[tool] Read");
```

---

## T5: typecheck + test

**Command**: `bun run typecheck && bun run test`

**Verification checklist**:
- [x] `bun run typecheck` が exit 0
- [x] `bun run test tests/unit/adapter/claude-code/message-types.test.ts` が green
- [x] `bun run test tests/unit/core/command/create-dialog.test.ts` の TC-CD-016 が pass
- [x] `bun run test` 全体が green

---

## タスク依存関係

```
T1 (message-types.ts) ← 必須
  ↓
T2 (create-dialog.ts) ← 必須（T1 の export に依存）
  ↓
T3 (message-types.test.ts) ← 必須（T1 の export に依存）
T4 (create-dialog.test.ts) ← 必須（T1 の export に依存）
  ↓
T5 (typecheck + test) ← 必須
```

T1 が先。T2, T3, T4 は T1 完了後に並行実施可能。T5 で検証。

---

## 完了条件

- [x] T1: `isToolUseSummary` 削除 + `isToolUseStart` 追加
- [x] T2: `consumeStream` の import・分岐・JSDoc 更新
- [x] T3: TC-MT-005 書き換え
- [x] T4: TC-CD-016 + inline テスト書き換え
- [x] T5: `bun run typecheck && bun run test` が green
