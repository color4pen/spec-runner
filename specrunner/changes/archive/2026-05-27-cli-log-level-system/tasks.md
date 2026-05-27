# Tasks: CLI ログレベル体系の整備

## Task 1: LogLevel 型とレベル解決関数を logger/stdout.ts に追加

**ファイル**: `src/logger/stdout.ts`

1. [x] `LogLevel` 型と `LEVEL_ORDER` 定数を定義する
2. [x] モジュール状態を `let verbose = false` → `let currentLevel: LogLevel = "default"` に置換
3. [x] `setLogLevel(level: LogLevel)` を追加
4. [x] `getLogLevel(): LogLevel` を追加
5. [x] `isLevelEnabled(level: LogLevel): boolean` を追加（`LEVEL_ORDER[currentLevel] >= LEVEL_ORDER[level]`）
6. [x] `resolveLogLevel(flags: LogLevelFlags): LogLevel` を追加（設計 D2 の優先順位: CLI フラグ > SPECRUNNER_LOG_LEVEL > DEBUG env > default）
7. [x] 旧関数 `setVerbose` / `isVerbose` / `resolveVerboseFlag` を削除

**検証**: `bun run typecheck` で型エラーが出ること（呼び出し側が未更新のため）。Task 4-6 で解消する。

## Task 2: ログ関数のゲート条件を LogLevel ベースに変更

**ファイル**: `src/logger/stdout.ts`

1. [x] `logWarn`: `if (!verbose) return;` → `if (!isLevelEnabled("default")) return;`（quiet 以外で出力）
2. [x] `logDebug`: `if (process.env["DEBUG"])` → `if (!isLevelEnabled("debug")) return;`（debug レベルで出力）
3. [x] `logInfo`: ゲートなし → `if (!isLevelEnabled("default")) return;`（quiet で抑制）
4. [x] `logStep`: ゲートなし → `if (!isLevelEnabled("default")) return;`（quiet で抑制）
5. [x] `logSuccess`: ゲートなし → `if (!isLevelEnabled("default")) return;`（quiet で抑制）
6. [x] `initVerboseLog` 内の `if (!verbose) return;` → `if (!isLevelEnabled("verbose")) return;`
7. [x] `logVerbose` 内の verbose チェック → `isLevelEnabled("verbose")` ベースに変更（logFd null チェックは維持）

**検証**: logWarn が default レベルで出力されること、logDebug が debug レベルでのみ出力されること。

## Task 3: SPECRUNNER_DEBUG サブシステムフィルタに debug レベルゲートを追加

**ファイル**: `src/core/lifecycle/diagnostic.ts`

1. [x] `logger/stdout.ts` から `isLevelEnabled` を import
2. [x] `logPipelineDiag` の先頭に `if (!isLevelEnabled("debug")) return;` を追加
3. [x] 既存の `SPECRUNNER_DEBUG` パース・フィルタロジックはその後に維持

**ファイル**: `src/core/lifecycle/__tests__/diagnostic.test.ts`

4. [x] テストの beforeEach で `setLogLevel("debug")` を呼ぶ（diagnostic が debug レベル依存になるため）
5. [x] debug レベル未設定時に `SPECRUNNER_DEBUG=pipeline` でも出力されないテストケースを追加

## Task 4: flag-parser に `-q` / `-v` / `-vv` 短縮フラグを追加

**ファイル**: `src/cli/flag-parser.ts`

1. [x] `-h` の特殊処理の直後に `-q` / `-v` / `-vv` の特殊処理を追加
2. [x] `-vv` を `-v` より先に判定する（`"-vv".startsWith("-v")` の衝突回避のため）
3. [x] `-q` → `flags["quiet"] = true`
4. [x] `-v` → `flags["verbose"] = true`
5. [x] `-vv` → `flags["debug"] = true`

**注意**: `-vv` は単一トークンとして扱う。`-v -v` の 2 トークンは verbose のまま（カウント方式は採用しない）。

## Task 5: command-registry のフラグ定義と handler を更新

**ファイル**: `src/cli/command-registry.ts`

1. [x] `run` コマンドの flags に `quiet: { type: "boolean" }` を追加（verbose は既存維持）
2. [x] `job start` の flags に `quiet: { type: "boolean" }` を追加
3. [x] `job resume` の flags に `quiet: { type: "boolean" }` を追加
4. [x] 各 handler で `resolveLogLevel` を import し、フラグを渡してレベルを解決
5. [x] handler から `runRun` / `runResume` へ渡すオプションを `{ verbose }` → `{ logLevel }` に変更

**注意**: `debug` フラグは command-registry の flags 定義には **追加しない**。`-vv` は flag-parser の短縮フラグ処理で `flags["debug"] = true` に変換されるため、`flagDefs` に `debug` が無いと `--debug` 使用時に `Unknown flag` エラーになる。これは意図通り（`-vv` のみをサポートし `--debug` は提供しない）。

## Task 6: CLI エントリポイント（run.ts / resume.ts）を LogLevel ベースに移行

**ファイル**: `src/cli/run.ts`

1. [x] `resolveVerboseFlag` import → `resolveLogLevel` / `setLogLevel` import に変更
2. [x] `runRunCore` の options を `{ verbose?: boolean }` → `{ logLevel?: LogLevel }` に変更
3. [x] `setVerbose(resolveVerboseFlag(...))` → `setLogLevel(options.logLevel ?? "default")` に変更
4. [x] `wireProgressDisplay` への `verbose` 引数を `logLevel` に変更

**ファイル**: `src/cli/resume.ts`

5. [x] 同様の変更を `runResumeCore` に適用

## Task 7: CommandRunner / PrepareResult / PipelineRunCommand / ResumeCommand を更新

**ファイル**: `src/core/command/runner.ts`

1. [x] `PrepareResult.verbose: boolean` → `PrepareResult.logLevel: LogLevel` に変更
2. [x] `initVerboseLog` 呼び出し前の条件を `isLevelEnabled("verbose")` で判定（initVerboseLog 内部にもガードがあるが、外側でも明示）

**ファイル**: `src/core/command/pipeline-run.ts`

3. [x] `PipelineRunOptions.verbose` → `logLevel` に変更
4. [x] `setVerbose(verbose)` → `setLogLevel(logLevel)` に変更
5. [x] `PrepareResult` に `logLevel` を返す

**ファイル**: `src/core/command/resume.ts`

6. [x] `ResumeOptions.verbose` → `logLevel` に変更（CLI 側の resume.ts の `ResumeOptions` とは別型）
7. [x] 同様に `setVerbose` → `setLogLevel` に変更

## Task 8: ProgressDisplay を LogLevel ベースに移行

**ファイル**: `src/cli/progress.ts`

1. [x] `ProgressDisplayOptions.verbose: boolean` → `logLevel: LogLevel` に変更
2. [x] `this.options.verbose` 参照箇所を `isLevelAtLeast` ヘルパーまたは直接比較に変更
3. [x] quiet レベル時に step 遷移メッセージ（`[step] running...` 等）を抑制する
4. [x] `wireProgressDisplay` の引数を更新

quiet レベルの ProgressDisplay 挙動:
- `onStepStart`: 抑制
- `onStepComplete` / `onStepError`: 抑制
- `onPipelineComplete` / `onPipelineFail`: **出力する**（最終結果は quiet でも通知）
- heartbeat: 抑制
- verbose 時の TTY overwrite 判定: `logLevel === "default"` のときのみ `\r` overwrite（verbose/debug は行単位）

## Task 9: テスト更新と追加

1. [x] `src/core/lifecycle/__tests__/diagnostic.test.ts` — Task 3 で記載済み
2. [x] 既存の `--verbose` 関連テストを `logLevel` ベースに更新（tests/unit/ 配下の各テスト）
3. [x] `resolveLogLevel` の単体テスト追加（CLI フラグ優先、env fallback、DEBUG alias）— `tests/unit/logger/log-level.test.ts`
4. [x] `logWarn` が default レベルで出力されることのテスト
5. [x] `logInfo` / `logStep` が quiet で抑制されることのテスト
6. [x] `-q` / `-v` / `-vv` の flag-parser テスト追加

## Task 10: 型チェック・テスト green 確認

1. [x] `bun run typecheck` — 全ファイルの型整合
2. [x] `bun run test` — 全テスト green（pre-existing `managed.test.ts` 1件は除く）
3. [ ] 手動確認: `SPECRUNNER_LOG_LEVEL=quiet specrunner doctor` で error のみ出力されること
