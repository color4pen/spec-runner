# Design: CLI ログレベル体系の整備

## 概要

4 系統が混在するログ制御（`--verbose`, `SPECRUNNER_LOG_LEVEL`, `SPECRUNNER_DEBUG`, `DEBUG`）を quiet / default / verbose / debug の 4 段階に統一する。

## 現状分析

### logger/stdout.ts の状態管理

```typescript
// 現状: boolean 1 つで verbose のみ制御
let verbose = false;
export function setVerbose(v: boolean): void { verbose = v; }
export function isVerbose(): boolean { return verbose; }
```

### 各ログ関数のゲート条件（現状）

| 関数 | 現在のゲート | 変更後のゲート |
|------|------------|--------------|
| `logError` | なし（常に出力） | なし（常に出力） |
| `logWarn` | `verbose === true` | `level >= default`（quiet 以外） |
| `logInfo` | なし | `level >= default` |
| `logStep` | なし | `level >= default` |
| `logSuccess` | なし | `level >= default` |
| `logDebug` | `process.env["DEBUG"]` | `level >= debug` |
| `logPipelineDiag` | `SPECRUNNER_DEBUG` に `pipeline` 含む | `level >= debug` **かつ** `SPECRUNNER_DEBUG` にサブシステム含む |
| `stderrWrite` | なし | なし（常に出力、operational message 用） |
| `logResult` | なし | なし（stdout、レベル無関係） |
| `stdoutWrite` | なし | なし（stdout、レベル無関係） |

## 設計

### D1: LogLevel 型と数値順序

```typescript
export type LogLevel = "quiet" | "default" | "verbose" | "debug";

const LEVEL_ORDER: Record<LogLevel, number> = {
  quiet: 0,
  default: 1,
  verbose: 2,
  debug: 3,
};
```

モジュール状態を `verbose: boolean` → `currentLevel: LogLevel` に置換する。

### D2: レベル解決関数 `resolveLogLevel`

`resolveVerboseFlag()` を `resolveLogLevel()` に置換する。優先順位:

1. CLI フラグ（`-q` / `-v` / `-vv`）— 最優先
2. `SPECRUNNER_LOG_LEVEL` 環境変数
3. `DEBUG` 環境変数（設定時は `debug` に昇格）
4. フォールバック: `default`

```typescript
export interface LogLevelFlags {
  quiet?: boolean;
  verbose?: boolean;   // -v or --verbose
  debug?: boolean;     // -vv
}

export function resolveLogLevel(flags: LogLevelFlags): LogLevel {
  // CLI flags take precedence (mutually exclusive; debug > verbose > quiet)
  if (flags.debug) return "debug";
  if (flags.verbose) return "verbose";
  if (flags.quiet) return "quiet";

  // Env: SPECRUNNER_LOG_LEVEL
  const envLevel = process.env["SPECRUNNER_LOG_LEVEL"];
  if (envLevel === "quiet" || envLevel === "verbose" || envLevel === "debug") {
    return envLevel;
  }

  // Env: DEBUG (legacy alias for debug)
  if (process.env["DEBUG"]) return "debug";

  return "default";
}
```

### D3: 後方互換ラッパー

既存の `setVerbose` / `isVerbose` / `resolveVerboseFlag` は呼び出し箇所が多い。段階的移行のため:

- **`setVerbose(true)`** → `setLogLevel("verbose")` に **直接書き換え**
- **`isVerbose()`** → `isLevelEnabled("verbose")` に **直接書き換え**
- **`resolveVerboseFlag()`** → `resolveLogLevel()` に **直接書き換え**

旧関数は削除する。呼び出し箇所は限定的（run.ts, resume.ts, pipeline-run.ts, resume command, progress.ts, runner.ts）で一括書き換え可能。

### D4: flag-parser への `-q` / `-v` / `-vv` 追加

現在 `-h` のみが短縮フラグとして特殊処理されている。同様のパターンで追加:

```typescript
// flag-parser.ts の while ループ内
if (arg === "-h") { flags["help"] = true; i++; continue; }
if (arg === "-q") { flags["quiet"] = true; i++; continue; }
if (arg === "-v") { flags["verbose"] = true; i++; continue; }
if (arg === "-vv") { flags["debug"] = true; i++; continue; }
```

`--verbose` は既存の boolean flag 定義で引き続き動作する（`verbose: { type: "boolean" }` はそのまま維持）。`-v` は `--verbose` と同じ `flags["verbose"] = true` を設定するので、handler 側の `!!parsed.flags["verbose"]` がそのまま機能する。

### D5: command-registry のフラグ定義更新

```typescript
// run / job start / job resume の flags に追加
flags: {
  verbose: { type: "boolean" },  // --verbose / -v (既存)
  quiet: { type: "boolean" },    // -q (新規)
  debug: { type: "boolean" },    // -vv (新規、--debug ではなく -vv のみ)
},
```

handler 内でフラグを `resolveLogLevel()` に渡す:

```typescript
const level = resolveLogLevel({
  quiet: !!parsed.flags["quiet"],
  verbose: !!parsed.flags["verbose"],
  debug: !!parsed.flags["debug"],
});
```

### D6: SPECRUNNER_DEBUG サブシステムフィルタの条件追加

`logPipelineDiag` に log level チェックを追加:

```typescript
export function logPipelineDiag(point: string, detail?: string): void {
  // debug レベルが有効でなければ即 return
  if (!isLevelEnabled("debug")) return;

  // サブシステムフィルタ（既存ロジック維持）
  const debugEnv = process.env["SPECRUNNER_DEBUG"] ?? "";
  const parts = debugEnv.split(",").map((s) => s.trim());
  if (!parts.includes("pipeline")) return;
  // ... 出力
}
```

`isLevelEnabled` は `logger/stdout.ts` から import する。diagnostic.ts が logger に依存する方向は既存（`stderrWrite` を import 済み）。

### D7: initVerboseLog の起動条件

verbose 以上で起動:

```typescript
// runner.ts
if (isLevelEnabled("verbose")) {
  initVerboseLog(repoRoot, jobState.jobId);
}
```

`initVerboseLog` 内部の `if (!verbose) return;` ガードは `if (!isLevelEnabled("verbose")) return;` に変更。

### D8: ProgressDisplay の verbose 参照

`ProgressDisplay` は `options.verbose` を heartbeat の TTY overwrite 制御に使用している。これは「verbose 以上なら行単位出力」の意味なので `logLevel` を渡してレベル比較に変更:

```typescript
// progress.ts
export interface ProgressDisplayOptions {
  logLevel: LogLevel;  // verbose → logLevel に rename
  // ...
}
// 参照箇所: this.options.verbose → isLevelAtLeast(this.options.logLevel, "verbose")
```

### D9: quiet レベルの挙動

quiet レベルでは `logInfo` / `logStep` / `logSuccess` / `logWarn` が全て抑制される。`logError` と `stderrWrite`（operational message）のみ出力。ProgressDisplay の step 遷移表示も quiet では抑制される。

ProgressDisplay 内の `process.stderr.write` 直接呼び出しは quiet 時に抑制する必要があるが、ProgressDisplay は logger を経由せず直接 stderr に書いている。quiet 判定用に `logLevel` を参照して出力を制御する。

## 影響範囲

### 変更ファイル

| ファイル | 変更内容 |
|---------|---------|
| `src/logger/stdout.ts` | LogLevel 型、setLogLevel、isLevelEnabled、resolveLogLevel、各関数のゲート変更 |
| `src/core/lifecycle/diagnostic.ts` | logPipelineDiag に debug レベルチェック追加 |
| `src/cli/flag-parser.ts` | `-q` / `-v` / `-vv` 短縮フラグ追加 |
| `src/cli/command-registry.ts` | quiet / debug フラグ定義追加、handler 更新 |
| `src/cli/run.ts` | resolveLogLevel + setLogLevel 使用 |
| `src/cli/resume.ts` | resolveLogLevel + setLogLevel 使用 |
| `src/cli/progress.ts` | verbose → logLevel に変更 |
| `src/core/command/runner.ts` | PrepareResult.verbose → logLevel |
| `src/core/command/pipeline-run.ts` | setLogLevel 使用 |
| `src/core/command/resume.ts` | setLogLevel 使用 |
| `src/core/lifecycle/__tests__/diagnostic.test.ts` | debug レベル依存テスト追加 |

### 変更しないファイル

- `src/logger/stdout.ts` のファイル名（スコープ外）
- `logResult` / `stdoutWrite`（stdout 系はレベル無関係）
- `maskSensitive`（レベルに依存しない）
- exit code 体系（スコープ外）
