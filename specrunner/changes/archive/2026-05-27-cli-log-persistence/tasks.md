## 1. Phase 1 — PipelineLogger + pipeline ログ自動保存

- [x] 1.1 `src/logger/pipeline-logger.ts` を新設し、`PipelineLogger` クラスを実装する。コンストラクタでログファイルパスを受け取り、`openSync` で append モードで開く（`mode: 0o600`）。`subscribe(events: EventBus)` で全 pipeline/step イベントを登録し、各イベントを `{ ts, type, ...payload }` の JSONL 行として `writeSync` で書き込む。**書き込み前に `maskSensitive()` を適用し API key 等のセンシティブ値をマスクすること（MUST）**。`close()` で fd を閉じる。書き込みエラー時は fd を閉じて以降 no-op にする（pipeline をブロックしない）
- [x] 1.2 `src/util/xdg.ts` に `getAgentLogDir(repoRoot: string, jobId: string): string` を追加する。戻り値は `<repoRoot>/.specrunner/logs/<jobId>/`。既存の `getVerboseLogDir` / `getVerboseLogPath` はそのまま保持する
- [x] 1.3 `src/logger/pipeline-logger.ts` に `initPipelineLog(repoRoot: string, jobId: string): PipelineLogger` factory 関数を追加する。ログディレクトリを `mkdirSync({ recursive: true })` で作成し、`PipelineLogger` インスタンスを返す
- [x] 1.4 `src/core/command/runner.ts` の `CommandRunner.execute()` を変更する。`prepare()` 完了直後（verbose log 初期化の直前）に `initPipelineLog(repoRoot, jobId)` を呼び、`pipelineLogger.subscribe(this.events)` で EventBus に接続する。finally ブロックで `pipelineLogger.close()` を呼ぶ。ログレベル条件分岐は不要（常時初期化）
- [x] 1.5 既存の `initVerboseLog()` を pipeline ログと同一ファイルパスに書き込むよう整合させる。`getVerboseLogPath(repoRoot, jobId)` は既に `.specrunner/logs/<jobId>.log` を返すためパス変更不要。初期化順序: `initPipelineLog()` → `initVerboseLog()`（verbose 有効時のみ）。`initVerboseLog` は `PipelineLogger` が既に開いたファイルに対して独立に append する
- [x] 1.6 `PipelineLogger` の単体テストを追加する。fake EventBus にイベントを emit し、書き込まれた JSONL 行をパースして検証する。テスト対象: step:start / step:complete / step:error / verdict:parsed / pipeline:complete / pipeline:fail イベント
- [x] 1.7 `bun run typecheck && bun run test` が green であることを確認する

## 2. Phase 2 — Agent session log (debug レベル)

- [x] 2.1 `src/core/port/agent-runner.ts` の `AgentRunContext` に `sessionLogPath?: string` フィールドを追加する。adapter は このパスが設定されている場合のみ agent session log を書き込む
- [x] 2.2 `src/core/step/executor.ts` の `runAgentStep()` で、debug レベル時に `sessionLogPath` を ctx に設定する。パスは `getAgentLogDir(repoRoot, jobId)` + `<stepName>-<attempt>.jsonl`。`repoRoot` は `deps` から取得する（`PipelineDeps` に `repoRoot` を追加する必要がある場合は追加する）
- [x] 2.3 `src/adapter/claude-code/agent-runner.ts` の `ClaudeCodeRunner.run()` を変更する。`ctx.sessionLogPath` が設定されている場合、SDK の `AsyncGenerator<SDKMessage>` iterate 中に各 message を `{ ts, type: msg.type, ...relevant_fields }` として JSONL 行で書き込む。書き込み対象フィールド: message type, content（text / tool_use / tool_result）。query 完了後に session ID / model / modelUsage のサマリ行を書き込む。fd は step 完了時に close する。**書き込み前に `maskSensitive()` を適用し、API key・GitHub token 等のセンシティブ値をマスクすること（MUST）**
- [x] 2.4 `src/adapter/claude-code/session-log-writer.ts` を新設する。`SessionLogWriter` クラスで fd 管理と JSONL 書き込みを担う。`ClaudeCodeRunner` から利用する。書き込みエラー時は fd を閉じて no-op にする（pipeline をブロックしない）
- [x] 2.5 `SessionLogWriter` の単体テストを追加する。tmp ファイルに書き込み、内容を検証する。session ID / model / token 使用量が記録されることを確認する
- [x] 2.6 `bun run typecheck && bun run test` が green であることを確認する

## 3. Phase 3 — 個数ベース retention

- [x] 3.1 `src/logger/log-retention.ts` を新設する。`pruneOldLogs(logsDir: string, maxJobs: number): Promise<void>` 関数を実装する。`.specrunner/logs/` 直下の `*.log` を `fs.stat` で mtime 取得し、降順ソート後 `maxJobs` 超過分の jobId を特定。`<jobId>.log` と `<jobId>/` ディレクトリの両方を `fs.rm({ recursive: true })` で削除する。ENOENT は無視する
- [x] 3.2 `src/config/schema.ts` の `SpecRunnerConfig` に `logs?: LogsConfig` を追加する。`LogsConfig` は `{ maxJobs?: number }` で、`validateConfig()` に範囲チェック（1-1000、未指定時デフォルト 20）を追加する
- [x] 3.3 `src/core/command/runner.ts` の `CommandRunner.execute()` で、`initPipelineLog()` の直前に `pruneOldLogs()` を呼ぶ。`config.logs?.maxJobs ?? 20` を渡す。`pruneOldLogs` のエラーは catch して `logWarn` で報告し、pipeline 実行は継続する
- [x] 3.4 `pruneOldLogs` の単体テストを追加する。tmp ディレクトリに dummy ログファイルを作成し、maxJobs=3 で超過分が削除されること、`<jobId>/` ディレクトリも削除されることを検証する
- [x] 3.5 config validation テストを追加する。`logs.maxJobs` が範囲外 (0, -1, 1001) で CONFIG_INVALID がスローされること、未指定で デフォルト 20 が使われることを検証する
- [x] 3.6 `bun run typecheck && bun run test` が green であることを確認する

## 4. Phase 4 — finish / cancel での pipeline ログ初期化

- [x] 4.1 `src/logger/pipeline-logger.ts` に `logPipelineEvent(entry: Record<string, unknown>): void` モジュールレベル関数を追加する。`initPipelineLog()` で初期化された fd に書き込む。EventBus を使わない deterministic コマンド（finish / cancel）用のシンプルなエントリポイント
- [x] 4.2 `src/cli/finish.ts` の `runFinish()` を変更する。slug → jobId 解決後に `initPipelineLog(repoRoot, jobId)` を呼ぶ（`repoRoot` は `opts.cwd` から解決）。orchestrator 呼び出し前後で `logPipelineEvent()` で開始 / 完了 / エラーを記録する。finally で `closePipelineLog()` を呼ぶ
- [x] 4.3 `src/cli/cancel.ts` の `runCancel()` を変更する。jobId 解決後に `initPipelineLog(repoRoot, resolvedJobId)` を呼ぶ。cancel 実行前後で `logPipelineEvent()` で記録する。finally で `closePipelineLog()` を呼ぶ。`--all-terminated` パスでは job ごとにログ初期化しない（bulk 操作のため）
- [x] 4.4 finish / cancel での pipeline ログ出力の単体テストを追加する。ログファイルが作成され、開始 / 完了イベントが記録されることを検証する
- [x] 4.5 `bun run typecheck && bun run test` が green であることを確認する

## 5. Phase 5 — job show にログパス表示

- [x] 5.1 `src/cli/job-show.ts` の `printJobState()` に `Log:` 行を追加する。`getVerboseLogPath(repoRoot, jobId)` でパスを取得し、`fs.existsSync()` でファイル存在を確認する。存在する場合は repoRoot からの相対パスを表示、存在しない場合は `(none)` を表示する
- [x] 5.2 `job show` テストを更新し、`Log:` 行が出力に含まれることを検証する
- [x] 5.3 `bun run typecheck && bun run test` が green であることを確認する

## 6. Phase 6 — Delta spec + ADR

- [x] 6.1 `specrunner/changes/cli-log-persistence/specs/cli-log-persistence/` に新規 spec を作成する。pipeline ログの自動保存、agent session log、retention の要件・シナリオを記述する
- [x] 6.2 `specrunner/changes/cli-log-persistence/specs/verbose-execution-log/` に delta spec を作成する。pipeline ログとの統合に関する MODIFIED requirement を記述する
- [x] 6.3 `specrunner/changes/cli-log-persistence/specs/cli-commands/` に delta spec を作成する。`job show` の `Log:` フィールド追加に関する MODIFIED requirement を記述する
- [x] 6.4 `specrunner/changes/cli-log-persistence/specs/cli-config-store/` に delta spec を作成する。`logs.maxJobs` フィールド追加に関する MODIFIED requirement を記述する
- [x] 6.5 ADR を作成する（request.md で `adr: true` が指定されているため）。pipeline ログの 2 層モデル、個数ベース retention、EventBus subscriber パターンの採用理由を記録する
- [x] 6.6 `bun run typecheck && bun run test` が green であることを確認する（最終ゲート）
