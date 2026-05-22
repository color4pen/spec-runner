# Design: foreground-progress-display

## Summary

長尺 step 実行中の無音区間を解消する。`ProgressDisplay` に heartbeat timer を追加し、step + elapsed を定期出力する。adapter は既存 `ctx.emit` で `step:progress` を流し、`ProgressDisplay` が throttle/render を一元管理する。

## D1: DomainEvent に `step:progress` を正規追加

`src/core/event/types.ts` の `DomainEvent` union に `"step:progress"` を追加し、`EventPayloadMap` に payload 型を定義する。

```ts
// types.ts に追加
"step:progress": { step: string; tool: string; target?: string };
```

これにより executor.ts:150-152 の `as never` キャストが `step:progress` に対しては型安全になる。既存の `commit:push` 等の非正規 event は影響を受けない（キャスト経路がそのまま残る）。

EventBus の `on`/`emit` は `DomainEvent` 制約で動くので、追加後は `events.on("step:progress", handler)` が型安全に記述できる。

## D2: adapter の progress emit — claude-code 限定

`src/adapter/claude-code/agent-runner.ts` の stream loop（main: L141-144, follow-up: L213-216）で、`message.type === "result"` 以外のメッセージから tool_use を検出し `ctx.emit("step:progress", { step, tool, target? })` を呼ぶ。

**共通ヘルパー**: 2 つの stream loop（runQuery と follow-up）に同じ検出ロジックを書かないよう、ファイル内 private helper を 1 つ作る:

```ts
function emitToolProgress(
  msg: SDKMessage,
  ctx: { emit: AgentRunContext["emit"]; stepName: string },
): void {
  // tool_use content block を検出 → ctx.emit("step:progress", ...)
}
```

両 loop の `for await` 内から呼ぶ。

**tool_use 検出**: `message-types.ts` に `isToolUse` type guard を追加。SDK の assistant message 内 content block で `type === "tool_use"` のものを判別する。具体的な形状は `@anthropic-ai/claude-agent-sdk` の型定義を実装時に確認する（stream_event の内部構造）。

**managed runtime は floor のみ**: `ManagedAgentRunner` は `ctx.emit("step:progress", ...)` を呼ばない。SSE が built-in tool の粒度を提供しないため。idle-timeout 回避は D3 の floor で達成。

## D3: ProgressDisplay の heartbeat timer（floor）

`src/cli/progress.ts` の `ProgressDisplay` に以下を追加:

### 状態

```ts
private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
private currentStep: string | null = null;
private progressCount = 0;        // step:progress 受信カウンタ
private lastTool: string | null = null;
private timerFn: typeof setInterval;   // injectable for test
private nowFn: () => number;           // injectable for test
```

### ライフサイクル

1. **`step:start`** → `currentStep` を記録、`progressCount = 0`、`lastTool = null`、`startHeartbeat()` を呼ぶ
2. **`step:progress`** → `progressCount++`、`lastTool = payload.tool`（蓄積のみ、描画しない）
3. **heartbeat tick**（`setInterval` callback）→ 経過時間 + 進捗サマリを 1 行出力
4. **`step:complete` / `step:error`** → `stopHeartbeat()`
5. **`pipeline:complete` / `pipeline:fail`** → `stopHeartbeat()`（safety net）

### `stopHeartbeat()`

```ts
private stopHeartbeat(): void {
  if (this.heartbeatTimer !== null) {
    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
```

全停止経路（`step:complete`, `step:error`, `pipeline:complete`, `pipeline:fail`）で呼ぶ。timer leak で CI が hang しないことが最重要。

### dispose

`ProgressDisplay` に `dispose()` public method を追加し、`stopHeartbeat()` を呼ぶ。呼び出し元（CLI composition point）がプロセス終了前に呼べるようにする。異常終了で `dispose` が呼ばれなくても、`pipeline:fail` event で timer は停止済みのはず。二重停止は `null` check でガード。

## D4: render 分岐 — TTY vs 非TTY

heartbeat tick の出力形式を分岐:

| 条件 | 形式 |
|---|---|
| `process.stdout.isTTY && !verbose` | `\r` 上書き 1 行（trailing padding で前行残り消去） |
| `!process.stdout.isTTY` or `verbose` | `\n` append 1 行 |

**出力内容**: `[<step>] <elapsed>s <enrichment>`

- enrichment あり: `[implementer] 120s | 5 actions, last: Edit pipeline.ts`
- enrichment なし（floor）: `[implementer] 120s`

TTY 判定は `process.stdout.isTTY` を直接参照。verbose は既存の `this.options.verbose` を使う。

## D5: heartbeat interval の config knob

`SpecRunnerConfig` に `progress` セクションを新設:

```ts
export interface ProgressConfig {
  /** Heartbeat interval in seconds. 0 or "off" to disable. */
  heartbeatIntervalSec?: number | null;
}

export interface SpecRunnerConfig {
  // ... 既存フィールド ...
  progress?: ProgressConfig;
}
```

**解決優先度**:
1. `config.progress.heartbeatIntervalSec` — config file
2. `SPECRUNNER_HEARTBEAT_INTERVAL` env var
3. flag（CLI flag は本変更では追加しない、env で十分）
4. default: TTY = 30（`\r` 上書きなので高頻度可）、非TTY = 60

`0` または `null` で heartbeat 無効。

**validator**: `validateConfig()` に `progress.heartbeatIntervalSec` の検証を追加。`number >= 0 or null`。

## D6: message-types.ts への isToolUse guard 追加

`src/adapter/claude-code/message-types.ts` に `isToolUse` type guard を追加。Claude Agent SDK の stream message 内で tool_use content block を検出する。

具体的な形状は SDK 型定義の確認が必要だが、想定:

```ts
export function isToolUse(v: unknown): v is {
  type: "stream_event";
  event: { type: "content_block_start"; content_block: { type: "tool_use"; name: string; } };
} { ... }
```

`target` は tool input から推定可能な場合のみ設定（例: Edit/Write の file_path、Bash の command 先頭）。推定不能なら `undefined`。

## D7: wireProgressDisplay の options 拡張

`wireProgressDisplay()` の `opts` に `heartbeatIntervalSec` を追加:

```ts
export function wireProgressDisplay(
  events: EventBus,
  opts: {
    verbose: boolean;
    slug: string;
    heartbeatIntervalSec: number;  // 0 = disabled
    timerFn?: typeof setInterval;
    nowFn?: () => number;
  },
): ProgressDisplay { ... }
```

`timerFn` / `nowFn` はテスト用の injection point。production では `setInterval` / `Date.now` がデフォルト。

呼び出し元（`src/cli/commands/run.ts` 等）で config → env → default の解決を行い、解決済み interval を渡す。

## 不採用案

- **core に timer を置く**: timer は表示の鼓動で振る舞いに非関与。core に属さない（D1 原則）
- **adapter に throttle/format**: adapter は正規化 event を emit するだけ。表示ロジックの分散は保守コスト増
- **port に `onProgress` callback 追加**: port 契約を変えず `ctx.emit` で十分。callback 追加は adapter ごとの実装負荷が増える
- **managed runtime の tool enrichment**: SSE が built-in tool の粒度を出さない。コスト/便益が薄い。floor で idle-timeout 回避は達成
