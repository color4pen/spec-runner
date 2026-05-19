# Tasks: verbose-execution-log

依存順: XDG ヘルパー → logger 拡張 → CLI 統合 → CommandRunner ライフサイクル → 計装 → テスト → 検証。

---

## [x] T-01: XDG State Dir ヘルパー追加

**ファイル**: `src/util/xdg.ts`

既存の `resolveXdgConfigDir()` / `resolveXdgDataDir()` と同じパターンで 3 関数を追加する。

```typescript
/**
 * Resolve XDG_STATE_HOME or fallback to ~/.local/state
 */
export function resolveXdgStateDir(): string {
  const xdgStateHome = process.env["XDG_STATE_HOME"];
  if (xdgStateHome && xdgStateHome.length > 0) {
    return xdgStateHome;
  }
  return path.join(os.homedir(), ".local", "state");
}

/**
 * Get the path to the specrunner verbose log directory.
 */
export function getVerboseLogDir(): string {
  return path.join(resolveXdgStateDir(), "specrunner", "logs");
}

/**
 * Get the path to a specific job's verbose log file.
 */
export function getVerboseLogPath(jobId: string): string {
  return path.join(getVerboseLogDir(), `${jobId}.log`);
}
```

---

## [x] T-02: Logger verbose 拡張

**ファイル**: `src/logger/stdout.ts`

### 2-a: import 追加

ファイル先頭に以下を追加:

```typescript
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";
import { getVerboseLogDir, getVerboseLogPath } from "../util/xdg.js";
```

### 2-b: module-level 変数追加

既存の `let verbose = false;` の下に:

```typescript
/** File descriptor for verbose log output. null when verbose logging is inactive. */
let logFd: number | null = null;

/** Path to the current verbose log file. null when inactive. */
let currentLogPath: string | null = null;
```

### 2-c: `resolveVerboseFlag()`

```typescript
/**
 * Resolve verbose flag from CLI flag and SPECRUNNER_LOG_LEVEL env var.
 * Returns true if either source enables verbose mode.
 */
export function resolveVerboseFlag(cliFlag: boolean): boolean {
  if (cliFlag) return true;
  return process.env["SPECRUNNER_LOG_LEVEL"] === "verbose";
}
```

### 2-d: `initVerboseLog()`

```typescript
/**
 * Initialize verbose log file for a job.
 * Creates the log directory if it doesn't exist and opens the log file in append mode.
 * No-op if verbose mode is not enabled (verbose === false).
 * Errors are caught and logged to stderr — verbose log failure must not block the pipeline.
 */
export function initVerboseLog(jobId: string): void {
  if (!verbose) return;
  try {
    const dir = getVerboseLogDir();
    mkdirSync(dir, { recursive: true });
    currentLogPath = getVerboseLogPath(jobId);
    logFd = openSync(currentLogPath, "a");
  } catch (err) {
    stderrWrite(`Warning: Failed to initialize verbose log: ${(err as Error).message}`);
    logFd = null;
    currentLogPath = null;
  }
}
```

### 2-e: `logVerbose()`

```typescript
/**
 * Write a verbose log entry to the log file.
 * No-op if verbose log is not initialized (logFd === null).
 * On write failure, closes the fd and stops further writes (pipeline must not be blocked).
 */
export function logVerbose(component: string, message: string, data?: Record<string, unknown>): void {
  if (logFd === null) return;
  try {
    const entry: Record<string, unknown> = { ts: new Date().toISOString(), component, message, ...data };
    const line = maskSensitive(JSON.stringify(entry)) + "\n";
    writeSync(logFd, line);
  } catch {
    // Write failure — disable further writes to avoid repeated errors
    try { closeSync(logFd); } catch { /* ignore */ }
    logFd = null;
  }
}
```

### 2-f: `closeVerboseLog()`

```typescript
/**
 * Close the verbose log file descriptor.
 * Safe to call multiple times or when no log is open.
 */
export function closeVerboseLog(): void {
  if (logFd !== null) {
    try { closeSync(logFd); } catch { /* ignore */ }
    logFd = null;
    currentLogPath = null;
  }
}
```

### 2-g: `getVerboseLogFilePath()`

```typescript
/**
 * Return the path to the current verbose log file, or null if not active.
 * Useful for displaying the log path to the user after pipeline completion.
 */
export function getVerboseLogFilePath(): string | null {
  return currentLogPath;
}
```

既存の `logInfo` / `logWarn` / `logError` / `logDebug` / `stderrWrite` / `stdoutWrite` / `logStep` / `logSuccess` は一切変更しない。

---

## [x] T-03: CLI verbose 解決

### 3-a: `src/cli/run.ts`

import に `resolveVerboseFlag` を追加:

```typescript
import { setVerbose, resolveVerboseFlag } from "../logger/stdout.js";
```

`setVerbose(options.verbose ?? false)` を以下に置き換え:

```typescript
setVerbose(resolveVerboseFlag(options.verbose ?? false));
```

### 3-b: `src/cli/resume.ts`

同様に import と `setVerbose` 呼び出しを変更:

```typescript
import { setVerbose, resolveVerboseFlag } from "../logger/stdout.js";
```

```typescript
setVerbose(resolveVerboseFlag(options.verbose ?? false));
```

---

## [x] T-04: CommandRunner ライフサイクル管理

**ファイル**: `src/core/command/runner.ts`

### 4-a: import 追加

```typescript
import { logInfo, logError, initVerboseLog, closeVerboseLog, logVerbose, getVerboseLogFilePath } from "../../logger/stdout.js";
```

既存の `import { logInfo, logError } from ...` を置き換え。

### 4-b: `execute()` 内で initVerboseLog

`prepare()` 成功後、EventBus / ProgressDisplay 生成の直後に追加:

```typescript
// Initialize verbose log file (no-op if verbose is disabled)
initVerboseLog(jobState.jobId);
```

### 4-c: 全 exit path で closeVerboseLog

`execute()` の以下 3 箇所にそれぞれ `closeVerboseLog()` を追加:

1. **setupWorkspace 失敗時** (return 1 の直前):
   ```typescript
   closeVerboseLog();
   return 1;
   ```

2. **pipeline throw catch ブロック** (return 1 の直前):
   ```typescript
   closeVerboseLog();
   return 1;
   ```

3. **正常終了 / soft error** (final return の直前):
   ```typescript
   closeVerboseLog();
   return exitCode;
   ```

buildDeps 失敗のパスも closeVerboseLog() が必要。漏れなく全 return の直前に入れる。

### 4-d: verbose 有効時にログパスを表示

`handleResult()` 内の最終出力の手前、または `execute()` の `handleResult()` 呼び出し後に:

```typescript
const logPath = getVerboseLogFilePath();
if (logPath) {
  logInfo(`Verbose log: ${logPath}`);
}
```

---

## [x] T-05: SSE イベント計装

**ファイル**: `src/adapter/managed-agent/sse-stream.ts`

### 5-a: import 追加

```typescript
import { stderrWrite, logVerbose } from "../../logger/stdout.js";
```

既存の `import { stderrWrite } from ...` を置き換え。

### 5-b: for-await ループ内の各イベント分岐に logVerbose を追加

各 `if` / `else if` ブロックの先頭（既存の `stderrWrite` の前）に `logVerbose` を追加する:

- `isCustomToolUseEvent`:
  ```typescript
  logVerbose("sse", "custom_tool_use event", { toolName: event.name });
  ```

- `isStatusIdleEvent` (end_turn):
  ```typescript
  logVerbose("sse", "status_idle event", { stopReason: "end_turn" });
  ```

- `isStatusIdleEvent` (requires_action / retries_exhausted / unknown):
  ```typescript
  logVerbose("sse", "status_idle event", { stopReason: stopType });
  ```

- `isStatusTerminatedEvent`:
  ```typescript
  logVerbose("sse", "status_terminated event");
  ```

- `isSessionErrorEvent`:
  ```typescript
  logVerbose("sse", "session_error event", { errorType: event.error.type, retryStatus: event.error.retry_status.type });
  ```

- `isSessionDeletedEvent`:
  ```typescript
  logVerbose("sse", "session_deleted event");
  ```

- `isStatusRescheduledEvent`:
  ```typescript
  logVerbose("sse", "status_rescheduled event");
  ```

### 5-c: SSE 接続時と切断時

SSE stream 接続成功後（`stream = await streamEvents(...)` 成功直後）:
```typescript
logVerbose("sse", "SSE stream connected", { sessionId });
```

SSE 切断時（catch ブロック内、`stderrWrite` の前）:
```typescript
logVerbose("sse", "SSE stream disconnected", { sessionId, error: (err as Error).message });
```

---

## [x] T-06: ポーリング計装

**ファイル**: `src/adapter/managed-agent/completion.ts`

### 6-a: import 追加

```typescript
import { stderrWrite, logVerbose } from "../../logger/stdout.js";
```

### 6-b: pollUntilComplete の while ループ内に計装

各 `await sleepFn(intervalMs)` の直後、`retrieveSession` 呼び出しの直後に:

```typescript
logVerbose("poll", "poll attempt", {
  sessionId,
  intervalMs,
  sessionStatus: session.status,
});
```

rescheduling 検出時:
```typescript
logVerbose("poll", "session rescheduling", {
  sessionId,
  reschedulingCount,
  maxReschedulingCount: MAX_RESCHEDULING_COUNT,
});
```

idle 検出時（getIdleStopReason 呼び出し後）:
```typescript
logVerbose("poll", "session idle detected", {
  sessionId,
  stopReason,
});
```

---

## [x] T-07: セッションライフサイクル計装

### 7-a: Managed Agent Runner

**ファイル**: `src/adapter/managed-agent/agent-runner.ts`

import に `logVerbose` を追加。

セッション作成後:
```typescript
logVerbose("session", "session created", { sessionId, stepName: step.name, runtime: "managed" });
```

セッション完了後:
```typescript
logVerbose("session", "session completed", { sessionId, stepName: step.name, runtime: "managed" });
```

### 7-b: Claude Code Runner

**ファイル**: `src/adapter/claude-code/agent-runner.ts`

import に `logVerbose` を追加。

`runQuery()` 呼び出し前:
```typescript
logVerbose("session", "query started", { stepName: step.name, runtime: "local", model: resolvedConfig.model });
```

`runQuery()` 成功後:
```typescript
logVerbose("session", "query completed", { stepName: step.name, runtime: "local", sessionId: extractedSessionId });
```

タイムアウト時:
```typescript
logVerbose("session", "query timeout", { stepName: step.name, runtime: "local", timeoutMs: resolvedConfig.timeoutMs });
```

エラー時:
```typescript
logVerbose("session", "query error", { stepName: step.name, runtime: "local", error: cause.message });
```

---

## [x] T-08: Step 遷移計装

**ファイル**: `src/core/step/executor.ts`

import に `logVerbose` を追加。

### 8-a: execute() 内

`events.emit("step:start", ...)` の直後:
```typescript
logVerbose("step", "step started", { step: step.name, jobId: jobState.jobId });
```

`events.emit("step:complete", ...)` の直前:
```typescript
logVerbose("step", "step completed", { step: step.name, jobId: jobState.jobId });
```

`events.emit("step:error", ...)` の直前:
```typescript
logVerbose("step", "step error", { step: step.name, jobId: jobState.jobId, error: (err as Error).message });
```

### 8-b: finalizeStep 内

verdict 確定後（`events.emit("verdict:parsed", ...)` の直前）:
```typescript
logVerbose("step", "verdict parsed", { step: step.name, verdict });
```

---

## [x] T-09: テスト

**新規ファイル**: `src/util/xdg.test.ts` に追加 or 新規（既存テストがあればそこに追加）

### 9-a: resolveXdgStateDir テスト

- `XDG_STATE_HOME` 設定時: その値を返す
- `XDG_STATE_HOME` 未設定時: `~/.local/state` を返す

### 9-b: resolveVerboseFlag テスト

**新規ファイル**: `src/logger/stdout.test.ts` に追加

- `resolveVerboseFlag(true)` → `true`（env var 無関係）
- `resolveVerboseFlag(false)` + `SPECRUNNER_LOG_LEVEL=verbose` → `true`
- `resolveVerboseFlag(false)` + `SPECRUNNER_LOG_LEVEL` 未設定 → `false`
- `resolveVerboseFlag(false)` + `SPECRUNNER_LOG_LEVEL=debug` → `false`（"verbose" 以外は無視）

### 9-c: logVerbose ファイル書き込みテスト

- `initVerboseLog` 後に `logVerbose` を呼び、ログファイルに JSON Lines が書き出されることを検証
- `closeVerboseLog` 後の `logVerbose` は何も書かないことを検証
- ログエントリに `ts` / `component` / `message` キーが含まれることを検証
- `maskSensitive` が適用され、API key がマスクされることを検証

テスト内で `XDG_STATE_HOME` を `os.tmpdir()` 配下のテンポラリディレクトリに設定し、テスト後にクリーンアップ。

### 9-d: ログファイル追記テスト

- `initVerboseLog(jobId)` → `logVerbose(...)` → `closeVerboseLog()` → 再度 `initVerboseLog(jobId)` → `logVerbose(...)` → `closeVerboseLog()`
- 1 ファイルに 2 エントリが追記されていることを検証（resume 挙動のシミュレーション）

### 9-e: イベント文字列含有テスト

- verbose 有効でパイプラインの計装ポイントを通過した後、ログファイルに以下の文字列が含まれることを string contains で検証:
  - `"step started"` or `"step_transition"`
  - `"session created"` or `"query started"`
  - `"poll attempt"` (managed runtime の場合)
  - `"event received"` or `"status_idle"` (managed runtime SSE の場合)

（注: format 詳細は ADR 確定後に assertion を詳細化する。現時点では緩めの string contains で十分）

---

## [x] T-10: ADR 作成

**新規ファイル**: `specrunner/adr/2026-05-19-verbose-execution-log.md`

design.md の「ADR Decisions」セクションの内容を ADR 形式で記録する:

1. ログ形式: JSON Lines（alternatives: plain text, JSON array）
2. タイムスタンプ: ISO 8601 ミリ秒精度
3. ログ出力先: `$XDG_STATE_HOME/specrunner/logs/<jobId>.log`
4. 設定経路: module-level global state + `resolveVerboseFlag()` 統合判定

---

## [x] T-11: 検証

```bash
bun run typecheck && bun run test
```

---

## 受け入れ基準（チェックリスト）

- [ ] `specrunner run --verbose <slug>` で `~/.local/state/specrunner/logs/<jobId>.log` にログが書き出される
- [ ] `SPECRUNNER_LOG_LEVEL=verbose` 環境変数でも同じ動作になる
- [ ] verbose 未指定時は log ファイル生成されず、stderr 出力は現状通り
- [ ] log ファイルに event type 文字列が含まれる（unit test）
- [ ] ポーリング回数 / 間隔 / セッション status がログに記録される（unit test）
- [ ] 同一 jobId の retry / resume で 1 ファイルに追記される（integration test）
- [ ] `specrunner resume --verbose <slug>` でも同一 jobId の log ファイルに追記される
- [ ] `~/.local/state/specrunner/logs/` ディレクトリは初回書き込み時に自動作成される
- [ ] `bun run typecheck && bun run test` が green
- [ ] ADR に判断が記録されている
