# Design: verbose-execution-log

## Overview

パイプライン実行中の内部状態を外部から観測可能にする。
`--verbose` フラグまたは `SPECRUNNER_LOG_LEVEL=verbose` 環境変数で有効化し、
`~/.local/state/specrunner/logs/<jobId>.log` に JSON Lines 形式でイベントログを書き出す。

既存の stderr 出力 (`stderrWrite` / `logWarn` / `logError`) は一切変更しない。

## Component Structure

### New Files

なし。既存ファイルへの追加のみ。

### Modified Files

| File | Change |
|------|--------|
| `src/util/xdg.ts` | `resolveXdgStateDir()`, `getVerboseLogDir()`, `getVerboseLogPath(jobId)` を追加 |
| `src/logger/stdout.ts` | `resolveVerboseFlag()`, `initVerboseLog()`, `logVerbose()`, `closeVerboseLog()` を追加 |
| `src/cli/run.ts` | `setVerbose()` の引数を `resolveVerboseFlag()` 経由に変更 |
| `src/cli/resume.ts` | 同上 |
| `src/core/command/runner.ts` | `execute()` 内で `initVerboseLog()` / `closeVerboseLog()` のライフサイクル管理 |
| `src/adapter/managed-agent/sse-stream.ts` | SSE イベント種別・payload を `logVerbose()` で記録 |
| `src/adapter/managed-agent/completion.ts` | ポーリング試行・間隔・セッション status を記録 |
| `src/adapter/managed-agent/agent-runner.ts` | セッション作成・削除タイミングを記録 |
| `src/adapter/claude-code/agent-runner.ts` | query() 開始・終了タイミングを記録 |
| `src/core/step/executor.ts` | step 遷移タイムスタンプを記録 |

## ADR Decisions

以下の判断を ADR に記録する（implementer が `specrunner/adr/2026-05-19-verbose-execution-log.md` として作成）。

### 1. ログ形式: JSON Lines

**Decision**: JSON Lines（1 行 = 1 JSON オブジェクト）。

**Alternatives**:
- Plain text: 人間が読みやすいが、構造化クエリ (`jq`) が困難
- JSON array: ファイル全体を読まないとパースできない。追記モードと相性が悪い

**Rationale**: `tail -f <file> | jq .` でリアルタイム監視、`jq 'select(.component == "poll")'` でフィルタ可能。追記モードで自然に動作する。

### 2. タイムスタンプ精度: ISO 8601 ミリ秒

**Decision**: `new Date().toISOString()` — 既存の `startedAt` / `completedAt` と同一形式。

### 3. ログ出力先: XDG_STATE_HOME

**Decision**: `$XDG_STATE_HOME/specrunner/logs/<jobId>.log`（デフォルト: `~/.local/state/specrunner/logs/`）。

**Rationale**: XDG Base Directory Spec において `$XDG_STATE_HOME` は「アプリケーション再起動間で永続するが `$XDG_DATA_HOME` に保存するほど重要/ポータブルでない状態データ」用。ログはまさにこの定義に該当。ジョブ状態ファイル (`$XDG_DATA_HOME`) とは区別する。

### 4. 設定経路: module-level global state

**Decision**: 既存の `verbose` フラグ + `logFd` を module-level 変数として管理。`resolveVerboseFlag()` で CLI flag / env var を統合判定。

**DI for tests**: `XDG_STATE_HOME` 環境変数でテスト用ディレクトリを指定。`initVerboseLog()` / `closeVerboseLog()` でライフサイクルを制御。

## Type Definitions

### Log Entry (JSON Lines 1 行分)

```typescript
// 型定義は明示的に export しない（logVerbose の内部フォーマット）
interface VerboseLogEntry {
  ts: string;         // ISO 8601 (e.g. "2026-05-19T10:30:00.123Z")
  component: string;  // "sse" | "poll" | "session" | "step" | "pipeline"
  message: string;    // 人間可読なイベント記述
  [key: string]: unknown;  // イベント固有のデータ
}
```

### 出力例

```jsonl
{"ts":"2026-05-19T10:30:00.123Z","component":"step","message":"step started","step":"propose"}
{"ts":"2026-05-19T10:30:01.456Z","component":"session","message":"session created","sessionId":"ses_abc123"}
{"ts":"2026-05-19T10:30:02.789Z","component":"sse","message":"event received","eventType":"session.status_idle","stopReason":"end_turn"}
{"ts":"2026-05-19T10:31:15.000Z","component":"poll","message":"poll attempt","attempt":3,"intervalMs":4500,"sessionStatus":"running"}
{"ts":"2026-05-19T10:35:00.000Z","component":"step","message":"step completed","step":"propose","verdict":"success"}
```

## Data Flow

```
CLI: specrunner run --verbose <slug>
  │
  ├─ resolveVerboseFlag(options.verbose) → true
  │    └─ checks: CLI flag || SPECRUNNER_LOG_LEVEL === "verbose"
  │
  ├─ setVerbose(true)
  │
  ├─ prepare() → { jobState, verbose: true, ... }
  │
  ├─ initVerboseLog(jobState.jobId)
  │     ├─ mkdirSync(~/.local/state/specrunner/logs/, { recursive: true })
  │     └─ openSync(<jobId>.log, 'a')  ← 追記モード
  │
  ├─ pipeline.run()
  │     ├─ step:start   → logVerbose("step", "step started", { step })
  │     ├─ SSE event    → logVerbose("sse", "event received", { eventType, ... })
  │     ├─ poll attempt → logVerbose("poll", "poll attempt", { attempt, intervalMs, sessionStatus })
  │     ├─ session ops  → logVerbose("session", "session created", { sessionId })
  │     └─ step:complete → logVerbose("step", "step completed", { step, verdict })
  │
  └─ closeVerboseLog()
       └─ closeSync(fd)
```

## Implementation Details

### resolveVerboseFlag (`src/logger/stdout.ts`)

```typescript
export function resolveVerboseFlag(cliFlag: boolean): boolean {
  if (cliFlag) return true;
  return process.env["SPECRUNNER_LOG_LEVEL"] === "verbose";
}
```

1 箇所で CLI flag と環境変数を統合判定する。他の module は `isVerbose()` で判定結果を参照するのみ。

### initVerboseLog / logVerbose / closeVerboseLog (`src/logger/stdout.ts`)

```typescript
import { openSync, writeSync, closeSync, mkdirSync } from "node:fs";

let logFd: number | null = null;

export function initVerboseLog(jobId: string): void {
  if (!verbose) return;
  const dir = getVerboseLogDir();
  mkdirSync(dir, { recursive: true });
  logFd = openSync(getVerboseLogPath(jobId), "a");
}

export function logVerbose(component: string, message: string, data?: Record<string, unknown>): void {
  if (logFd === null) return;
  const entry: Record<string, unknown> = { ts: new Date().toISOString(), component, message, ...data };
  writeSync(logFd, JSON.stringify(entry) + "\n");
}

export function closeVerboseLog(): void {
  if (logFd !== null) {
    closeSync(logFd);
    logFd = null;
  }
}
```

- `logVerbose` は `logFd === null` のみでガード。verbose=false なら `initVerboseLog` が fd を開かないため、コールサイトでの二重チェック不要。
- 同期書き込み（`writeSync`）— 既存 `stderrWrite` / `stdoutWrite` と同じ同期パターン。
- `maskSensitive` を `JSON.stringify(entry)` の結果に適用して token 漏洩を防止。

### CommandRunner ライフサイクル (`src/core/command/runner.ts`)

`execute()` 内の prepare() 成功後 〜 teardown 前の全パスで log ファイルを開閉する:

```typescript
// prepare() 成功後
initVerboseLog(jobState.jobId);

// ... pipeline execution ...

// 全 exit path（success / error / throw）で
closeVerboseLog();
```

### 計装ポイント

| ファイル | 計装内容 | component |
|----------|----------|-----------|
| `sse-stream.ts` | for-await ループ内の各 event type | `"sse"` |
| `completion.ts` | 各 poll attempt の interval / session.status | `"poll"` |
| `managed-agent/agent-runner.ts` | session create / archive | `"session"` |
| `claude-code/agent-runner.ts` | query() 開始 / 終了 | `"session"` |
| `executor.ts` | step start / complete / error | `"step"` |

## Error Handling

| Error | Response |
|-------|----------|
| ログディレクトリ作成失敗 | `initVerboseLog` が throw → CommandRunner で catch し stderr 警告を出して verbose なしで続行 |
| ログファイル書き込み失敗 | `logVerbose` 内で try-catch し、失敗時は `logFd = null` にして以降の書き込みを停止（パイプラインをブロックしない） |
| closeVerboseLog 失敗 | 握り潰し（プロセス終了時に OS が fd を回収） |

## Non-Goals

- 既存 stderr 出力の変更
- ログローテーション / 自動削除（gc コマンドで対応）
- log level 細分化（debug / trace — verbose ON/OFF の 2 値）
- 外部 aggregator 連携
- pipeline metrics の数値集計
