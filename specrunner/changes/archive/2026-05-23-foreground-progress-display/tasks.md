# Tasks: foreground-progress-display

## [x] 1. DomainEvent に `step:progress` を追加

**file**: `src/core/event/types.ts`

### 1.1 DomainEvent union に追加

```diff
 export type DomainEvent =
   | "pipeline:start"
   | "pipeline:complete"
   | "pipeline:fail"
   | "step:start"
   | "step:complete"
   | "step:error"
+  | "step:progress"
   | "verdict:parsed";
```

### 1.2 EventPayloadMap に payload 型追加

```diff
 export type EventPayloadMap = {
   // ... 既存 ...
+  "step:progress": { step: string; tool: string; target?: string };
   "verdict:parsed": { step: string; outcome: { verdict: string | null } };
 };
```

### 1.3 確認

`bun run typecheck` で既存の `as never` キャスト箇所（executor.ts:152）がコンパイルエラーにならないことを確認。`step:progress` は union に入るのでキャストは不要になるが、既存の `commit:push` 等は `as never` のまま残る。

---

## [x] 2. message-types.ts に isToolUse guard を追加

**file**: `src/adapter/claude-code/message-types.ts`

SDK の stream message から tool_use content block を検出する type guard を追加。具体的な判別条件は SDK 型定義（`@anthropic-ai/claude-agent-sdk`）を確認して決定する。

想定する形状:

```ts
export function isToolUse(v: unknown): v is {
  type: "stream_event";
  event: {
    type: "content_block_start";
    content_block: { type: "tool_use"; name: string; input?: Record<string, unknown> };
  };
} {
  if (!isStreamEvent(v)) return false;
  const event = v.event;
  if (event["type"] !== "content_block_start") return false;
  const cb = event["content_block"];
  if (typeof cb !== "object" || cb === null) return false;
  return (cb as Record<string, unknown>)["type"] === "tool_use";
}
```

**重要**: SDK の実際の型定義を確認し、stream message 内の tool_use 構造がこの想定と異なる場合は適宜調整する。

---

## [x] 3. claude-code adapter に progress emit を追加

**file**: `src/adapter/claude-code/agent-runner.ts`

### 3.1 共通ヘルパー関数の作成

ファイル内（class 外 or private method）に tool_use → emit ヘルパーを作成:

```ts
function emitToolProgress(
  msg: SDKMessage,
  emitFn: (event: string, payload: Record<string, unknown>) => void,
  stepName: string,
): void {
  if (!isToolUse(msg)) return;
  const cb = (msg as any).event.content_block;
  const tool = cb.name as string;
  // target 推定: Edit/Write → file_path, Bash → command 先頭等
  const target = extractTarget(cb.name, cb.input);
  emitFn("step:progress", { step: stepName, tool, ...(target ? { target } : {}) });
}
```

`extractTarget` は best-effort。推定不能なら `undefined` を返す。

### 3.2 main stream loop（L141-144）に呼び出し追加

```diff
 for await (const message of messages as AsyncGenerator<SDKMessage, void>) {
+  emitToolProgress(message, ctx.emit, step.name);
   if (message.type === "result") {
     lastResult = message as SDKResultMessage;
   }
 }
```

### 3.3 follow-up stream loop（L213-216）に呼び出し追加

```diff
 for await (const message of followMessages as AsyncGenerator<SDKMessage, void>) {
+  emitToolProgress(message, ctx.emit, step.name);
   if (message.type === "result") {
     followLastResult = message as SDKResultMessage;
   }
 }
```

### 3.4 import 追加

`isToolUse` を `message-types.ts` から import。

---

## [x] 4. SpecRunnerConfig に progress セクションを追加

**file**: `src/config/schema.ts`

### 4.1 ProgressConfig interface 定義

```ts
export interface ProgressConfig {
  /** Heartbeat interval in seconds. 0 or null to disable. */
  heartbeatIntervalSec?: number | null;
}
```

### 4.2 SpecRunnerConfig に追加

```diff
 export interface SpecRunnerConfig {
   // ... 既存 ...
+  progress?: ProgressConfig;
 }
```

### 4.3 validateConfig に検証追加

`progress.heartbeatIntervalSec` が指定されている場合:
- `null` → 有効（無効化）
- `number >= 0` かつ整数 → 有効
- それ以外 → `CONFIG_INVALID` を throw

```ts
if (obj["progress"] !== undefined && obj["progress"] !== null) {
  if (typeof obj["progress"] !== "object") {
    throw Object.assign(
      new Error("CONFIG_INVALID: progress must be an object."),
      { code: "CONFIG_INVALID" },
    );
  }
  const progress = obj["progress"] as Record<string, unknown>;
  if (progress["heartbeatIntervalSec"] !== undefined) {
    const interval = progress["heartbeatIntervalSec"];
    if (interval !== null) {
      if (typeof interval !== "number" || !Number.isInteger(interval) || interval < 0) {
        throw Object.assign(
          new Error("CONFIG_INVALID: progress.heartbeatIntervalSec must be a non-negative integer or null."),
          { code: "CONFIG_INVALID" },
        );
      }
    }
  }
}
```

### 4.4 RawConfig にも progress 追加

```diff
 export interface RawConfig {
   // ... 既存 ...
+  progress?: Partial<Record<string, unknown>>;
 }
```

---

## [x] 5. ProgressDisplay に heartbeat timer を実装

**file**: `src/cli/progress.ts`

これが本変更の中核。既存の `ProgressDisplay` class を拡張する。

### 5.1 constructor options 拡張

```ts
interface ProgressDisplayOptions {
  verbose: boolean;
  slug: string;
  heartbeatIntervalSec: number;  // 0 = disabled
  timerFn?: typeof setInterval;
  nowFn?: () => number;
}
```

constructor で `timerFn` / `nowFn` を保持（default: `setInterval` / `Date.now`）。

### 5.2 内部状態の追加

```ts
private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
private currentStep: string | null = null;
private progressCount = 0;
private lastTool: string | null = null;
private readonly timerFn: typeof setInterval;
private readonly clearTimerFn: typeof clearInterval;
private readonly nowFn: () => number;
private readonly heartbeatIntervalMs: number;  // 0 = disabled
private readonly isTTY: boolean;
```

### 5.3 subscribe に `step:progress` ハンドラ追加

```ts
this.events.on("step:progress", (p) => this.onStepProgress(p));
```

### 5.4 onStepProgress handler

```ts
private onStepProgress(p: { step: string; tool: string; target?: string }): void {
  this.progressCount++;
  this.lastTool = p.target ? `${p.tool} ${p.target}` : p.tool;
}
```

蓄積のみ。描画は heartbeat tick が担う。

### 5.5 onStepStart を拡張

既存の行出力の後に `startHeartbeat()` を呼ぶ:

```ts
private onStepStart(p: { step: string }): void {
  this.stepStartTimes.set(p.step, this.nowFn());
  this.currentStep = p.step;
  this.progressCount = 0;
  this.lastTool = null;
  process.stdout.write(`[${p.step}] running...\n`);
  this.startHeartbeat();
}
```

### 5.6 startHeartbeat / stopHeartbeat

```ts
private startHeartbeat(): void {
  this.stopHeartbeat();  // 二重起動防止
  if (this.heartbeatIntervalMs <= 0) return;
  this.heartbeatTimer = this.timerFn(() => {
    this.renderHeartbeat();
  }, this.heartbeatIntervalMs);
}

private stopHeartbeat(): void {
  if (this.heartbeatTimer !== null) {
    this.clearTimerFn(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }
}
```

### 5.7 renderHeartbeat

```ts
private renderHeartbeat(): void {
  if (this.currentStep === null) return;
  const elapsed = this.elapsedSeconds(this.currentStep);
  let line = `[${this.currentStep}] ${elapsed}s`;
  if (this.progressCount > 0) {
    line += ` | ${this.progressCount} actions`;
    if (this.lastTool) {
      line += `, last: ${this.lastTool}`;
    }
  }

  if (this.isTTY && !this.options.verbose) {
    // 上書き: padding で前行残りを消去
    const padded = line.padEnd(process.stdout.columns || 80);
    process.stdout.write(`\r${padded}`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}
```

### 5.8 step:complete / step:error で stopHeartbeat + TTY 改行

```ts
private onStepComplete(p: { step: string }): void {
  this.stopHeartbeat();
  if (this.isTTY && !this.options.verbose) {
    process.stdout.write("\r\x1b[K");  // 上書き行をクリア
  }
  const elapsed = this.elapsedSeconds(p.step);
  process.stdout.write(`[${p.step}] ✓ (${elapsed}s)\n`);
  this.currentStep = null;
}
```

`onStepError` も同様に `stopHeartbeat()` + TTY クリアを追加。

### 5.9 pipeline:complete / pipeline:fail で safety net

```ts
private onPipelineComplete(_p: unknown): void {
  this.stopHeartbeat();
  process.stdout.write(`\nNext: specrunner job finish ${this.options.slug}\n`);
}

private onPipelineFail(p: { reason: string }): void {
  this.stopHeartbeat();
  process.stdout.write(`Pipeline failed: ${p.reason}\n`);
}
```

### 5.10 dispose method

```ts
public dispose(): void {
  this.stopHeartbeat();
}
```

### 5.11 wireProgressDisplay の options 拡張

```ts
export function wireProgressDisplay(
  events: EventBus,
  opts: {
    verbose: boolean;
    slug: string;
    heartbeatIntervalSec: number;
    timerFn?: typeof setInterval;
    nowFn?: () => number;
  },
): ProgressDisplay {
  return new ProgressDisplay(events, opts);
}
```

---

## [x] 6. CLI composition point で heartbeat interval を解決

**file**: `src/cli/commands/run.ts` （および `resume.ts` 等、`wireProgressDisplay` 呼び出し箇所）

### 6.1 interval 解決関数

ファイル内 or util に配置:

```ts
function resolveHeartbeatInterval(config: SpecRunnerConfig): number {
  // 1. config
  const cfgVal = config.progress?.heartbeatIntervalSec;
  if (cfgVal === null || cfgVal === 0) return 0;  // disabled
  if (cfgVal !== undefined && cfgVal > 0) return cfgVal;

  // 2. env
  const envVal = process.env["SPECRUNNER_HEARTBEAT_INTERVAL"];
  if (envVal === "0" || envVal === "off") return 0;
  if (envVal !== undefined) {
    const parsed = parseInt(envVal, 10);
    if (!isNaN(parsed) && parsed >= 0) return parsed;
  }

  // 3. default
  return process.stdout.isTTY ? 30 : 60;
}
```

### 6.2 wireProgressDisplay 呼び出しを更新

既存:
```ts
wireProgressDisplay(events, { verbose, slug });
```

変更後:
```ts
const progress = wireProgressDisplay(events, {
  verbose,
  slug,
  heartbeatIntervalSec: resolveHeartbeatInterval(config),
});
```

### 6.3 dispose 呼び出し

pipeline 完了後（正常・異常とも）に `progress.dispose()` を呼ぶ。pipeline:complete/fail event で既に stopHeartbeat は呼ばれるが、safety net として明示的に dispose する。

---

## [x] 7. テスト

### 7.1 DomainEvent 型テスト

**file**: 既存の event 関連テストファイル

- `step:progress` が `DomainEvent` union に含まれること（型レベル）
- `EventBus` で `step:progress` の emit/on が動作すること

### 7.2 ProgressDisplay heartbeat テスト

**file**: 新規 `src/cli/__tests__/progress.test.ts` or 既存テストに追加

- `step:start` → heartbeat tick → elapsed 出力が行われること（`timerFn` を fake timer で注入）
- `step:progress` → `progressCount` / `lastTool` が更新されること
- `step:complete` → `stopHeartbeat` が呼ばれ timer が clear されること
- `pipeline:fail` → `stopHeartbeat` が呼ばれること（safety net）
- `dispose()` → timer が clear されること
- heartbeatIntervalSec = 0 → timer が起動しないこと
- TTY = true かつ非 verbose → `\r` 上書き形式
- TTY = false → `\n` append 形式

### 7.3 config validation テスト

**file**: 既存の config テストファイル

- `progress.heartbeatIntervalSec: 30` → valid
- `progress.heartbeatIntervalSec: 0` → valid（disabled）
- `progress.heartbeatIntervalSec: null` → valid（disabled）
- `progress.heartbeatIntervalSec: -1` → CONFIG_INVALID
- `progress.heartbeatIntervalSec: "foo"` → CONFIG_INVALID

### 7.4 timer leak テスト

- `step:start` → `step:error` で timer が確実に clear されること
- 複数 step が連続実行されても timer が leak しないこと（`startHeartbeat` 冒頭の `stopHeartbeat` で二重起動防止）

### 7.5 adapter emit テスト

**file**: 既存の claude-code agent-runner テストファイル

- stream に tool_use message が含まれる場合、`ctx.emit("step:progress", ...)` が呼ばれること
- stream に tool_use がない場合、`step:progress` は emit されないこと
- main loop と follow-up loop の両方で emit が動作すること

---

## [x] 8. typecheck & test green 確認

`bun run typecheck && bun run test` を実行し、全テストが pass することを確認。
