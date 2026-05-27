# Test Cases: CLI ログ永続化 + retention + agent durable log

## 凡例

- **Priority**: must / should / could
- **Source**: tasks.md タスク番号 または request.md 受け入れ基準 (AC-N)

---

## Category: PipelineLogger — 基本動作

### T-001: run 実行時に pipeline ログファイルが自動作成される

- **Priority**: must
- **Source**: AC-1, Task 1.4

```
GIVEN run コマンドが実行され jobId が確定している
WHEN  CommandRunner.execute() が pipeline を開始する
THEN  .specrunner/logs/<jobId>.log が JSONL 形式で作成される
```

### T-002: ログレベル default でも pipeline ログが保存される

- **Priority**: must
- **Source**: AC-1, Task 1.4

```
GIVEN ログレベルが default（-v なし）
WHEN  run コマンドを実行する
THEN  .specrunner/logs/<jobId>.log が作成され pipeline-event エントリが書き込まれる
```

### T-003: resume 実行時にも pipeline ログが自動保存される

- **Priority**: must
- **Source**: AC-1, Task 1.4

```
GIVEN resume コマンドが実行され jobId が確定している
WHEN  CommandRunner.execute() が pipeline を開始する
THEN  .specrunner/logs/<jobId>.log が JSONL 形式で作成される
```

### T-004: verbose レベルで pipeline ログと logVerbose エントリが同一ファイルに書き込まれる

- **Priority**: must
- **Source**: D2, Task 1.5

```
GIVEN ログレベルが verbose (-v)
WHEN  run コマンドを実行する
THEN  .specrunner/logs/<jobId>.log に pipeline-event と logVerbose のエントリが混在する
AND   jq で type フィールドを使い種別を分別できる
```

### T-005: initPipelineLog がディレクトリを再帰的に作成する

- **Priority**: must
- **Source**: Task 1.3

```
GIVEN .specrunner/logs/ ディレクトリが存在しない
WHEN  initPipelineLog(repoRoot, jobId) が呼ばれる
THEN  ディレクトリが再帰的に作成され PipelineLogger インスタンスが返される
```

### T-006: pipeline ログファイルが append モード (0o600) で開かれる

- **Priority**: should
- **Source**: Task 1.1

```
GIVEN PipelineLogger がコンストラクタでログファイルパスを受け取る
WHEN  openSync でファイルが開かれる
THEN  append モードかつ mode 0o600 でファイルが開かれる
```

### T-007: pipeline 完了後に finally で fd が閉じられる

- **Priority**: must
- **Source**: Task 1.4

```
GIVEN pipeline 実行が完了（または失敗）する
WHEN  CommandRunner.execute() の finally ブロックが実行される
THEN  pipelineLogger.close() が呼ばれ fd が正常に閉じられる
```

---

## Category: PipelineLogger — EventBus イベント記録

### T-008: step:start イベントが JSONL で記録される

- **Priority**: must
- **Source**: Task 1.6

```
GIVEN PipelineLogger が EventBus に subscribe している
WHEN  EventBus で step:start イベントが emit される
THEN  { ts, type: "step:start", ...payload } の JSONL 行がファイルに書き込まれる
```

### T-009: step:complete イベントが JSONL で記録される（step 名・verdict・elapsed を含む）

- **Priority**: must
- **Source**: Task 1.6, request 要件 1

```
GIVEN PipelineLogger が EventBus に subscribe している
WHEN  step:complete イベントが emit される
THEN  step 名、verdict、elapsed を含む JSONL 行がファイルに書き込まれる
```

### T-010: step:error イベントが JSONL で記録される（code・message・hint を含む）

- **Priority**: must
- **Source**: Task 1.6, request 要件 1

```
GIVEN PipelineLogger が EventBus に subscribe している
WHEN  step:error イベントが emit される
THEN  error code、message、hint を含む JSONL 行がファイルに書き込まれる
```

### T-011: verdict:parsed イベントが JSONL で記録される

- **Priority**: must
- **Source**: Task 1.6

```
GIVEN PipelineLogger が EventBus に subscribe している
WHEN  verdict:parsed イベントが emit される
THEN  verdict 情報を含む JSONL 行がファイルに書き込まれる
```

### T-012: pipeline:complete イベントが JSONL で記録される

- **Priority**: must
- **Source**: Task 1.6

```
GIVEN PipelineLogger が EventBus に subscribe している
WHEN  pipeline:complete イベントが emit される
THEN  JSONL 行がファイルに書き込まれる
```

### T-013: pipeline:fail イベントが JSONL で記録される

- **Priority**: must
- **Source**: Task 1.6

```
GIVEN PipelineLogger が EventBus に subscribe している
WHEN  pipeline:fail イベントが emit される
THEN  JSONL 行がファイルに書き込まれる
```

### T-014: 各 JSONL 行に ts と type フィールドが含まれる

- **Priority**: must
- **Source**: Task 1.1

```
GIVEN PipelineLogger がイベントを受け取る
WHEN  JSONL 行が writeSync で書き込まれる
THEN  各行に ts（タイムスタンプ）と type フィールドが含まれる
AND   各行が valid JSON である（JSON.parse でパースエラーなし）
```

---

## Category: PipelineLogger — エラー耐性・セキュリティ

### T-015: 書き込みエラー時に fd を閉じ以降 no-op になる

- **Priority**: must
- **Source**: Task 1.1

```
GIVEN PipelineLogger のファイル書き込みでエラーが発生する
WHEN  その後もイベントが emit される
THEN  pipeline はブロックされない
AND   以降の書き込み呼び出しは no-op になる
```

### T-016: センシティブ値（API key）がマスクされてログに書き込まれる

- **Priority**: must
- **Source**: Task 1.1（maskSensitive MUST）

```
GIVEN イベントペイロードに API key が含まれる
WHEN  PipelineLogger が JSONL 行を書き込む
THEN  ログファイルに API key がマスクされて記録される（平文で出力されない）
```

---

## Category: Agent Session Log

### T-017: debug レベルで agent session log が保存される

- **Priority**: must
- **Source**: AC-2, Task 2.2

```
GIVEN ログレベルが debug (-vv)
WHEN  agent step が実行される
THEN  .specrunner/logs/<jobId>/<stepName>-<attempt>.jsonl にログが作成される
```

### T-018: default レベルで agent session log が保存されない

- **Priority**: must
- **Source**: AC-2, D3

```
GIVEN ログレベルが default（-vv なし）
WHEN  agent step が実行される
THEN  .specrunner/logs/<jobId>/ ディレクトリ内に session log ファイルが作成されない
```

### T-019: verbose レベルでも agent session log が保存されない

- **Priority**: must
- **Source**: D3（opt-in は debug のみ）

```
GIVEN ログレベルが verbose (-v)
WHEN  agent step が実行される
THEN  .specrunner/logs/<jobId>/ ディレクトリ内に session log ファイルが作成されない
```

### T-020: debug 時に AgentRunContext.sessionLogPath が設定される

- **Priority**: must
- **Source**: Task 2.2

```
GIVEN ログレベルが debug
WHEN  StepExecutor が runAgentStep() を実行する
THEN  ctx.sessionLogPath に <agentLogDir>/<stepName>-<attempt>.jsonl が設定される
```

### T-021: 非 debug 時に AgentRunContext.sessionLogPath が未設定のまま

- **Priority**: must
- **Source**: Task 2.2

```
GIVEN ログレベルが verbose 以下（non-debug）
WHEN  StepExecutor が runAgentStep() を実行する
THEN  ctx.sessionLogPath が undefined のまま
```

### T-022: session log に SDK message（text/tool_use/tool_result）が記録される

- **Priority**: must
- **Source**: Task 2.3

```
GIVEN ログレベルが debug で agent step が実行される
WHEN  SDK から assistant text / tool_use / tool_result message が返される
THEN  各 message が { ts, type, ...relevant_fields } の JSONL 行として書き込まれる
```

### T-023: session log サマリ行に session ID が記録される

- **Priority**: must
- **Source**: AC-3, Task 2.3

```
GIVEN ログレベルが debug で agent step が実行される
WHEN  SDK query が完了しサマリ行が書き込まれる
THEN  JSONL ファイルのサマリ行に session ID フィールドが含まれる
```

### T-024: session log サマリ行に model 名が記録される

- **Priority**: must
- **Source**: AC-3, Task 2.3

```
GIVEN ログレベルが debug で agent step が実行される
WHEN  SDK query が完了しサマリ行が書き込まれる
THEN  JSONL ファイルのサマリ行に model 名フィールドが含まれる
```

### T-025: session log サマリ行に token 使用量が記録される

- **Priority**: must
- **Source**: AC-3, Task 2.3

```
GIVEN ログレベルが debug で agent step が実行される
WHEN  SDK query が完了しサマリ行が書き込まれる
THEN  JSONL ファイルのサマリ行に modelUsage フィールドが含まれる
```

### T-026: session log にセンシティブ値がマスクされる

- **Priority**: must
- **Source**: Task 2.3（maskSensitive MUST）

```
GIVEN SDK message に GitHub token 等のセンシティブ値が含まれる
WHEN  ClaudeCodeRunner が session log に書き込む
THEN  センシティブ値がマスクされてログファイルに記録される
```

### T-027: SessionLogWriter が書き込みエラー時に no-op になる

- **Priority**: must
- **Source**: Task 2.4

```
GIVEN SessionLogWriter の書き込みでエラーが発生する
WHEN  その後も SDK message が iterate される
THEN  pipeline はブロックされない
AND   以降の書き込みは no-op になる
```

### T-028: getAgentLogDir が正しいパスを返す

- **Priority**: must
- **Source**: Task 1.2

```
GIVEN repoRoot と jobId が与えられる
WHEN  getAgentLogDir(repoRoot, jobId) が呼ばれる
THEN  <repoRoot>/.specrunner/logs/<jobId>/ を返す
```

---

## Category: Log Retention

### T-029: maxJobs 超過時に最古の job ログが削除される

- **Priority**: must
- **Source**: AC-5, Task 3.1

```
GIVEN .specrunner/logs/ に 5 個の *.log ファイルがあり maxJobs=3 が設定されている
WHEN  pruneOldLogs(logsDir, 3) が実行される
THEN  mtime が古い 2 個の <jobId>.log が削除される
AND   mtime が新しい 3 個の <jobId>.log は残る
```

### T-030: 削除対象の jobId ディレクトリも削除される

- **Priority**: must
- **Source**: AC-5, Task 3.1

```
GIVEN .specrunner/logs/ に 5 個のログと対応する <jobId>/ ディレクトリがある
WHEN  maxJobs=3 で pruneOldLogs() が実行される
THEN  削除対象の <jobId>.log と <jobId>/ ディレクトリの両方が削除される
```

### T-031: maxJobs 以内ならログが削除されない

- **Priority**: must
- **Source**: Task 3.1

```
GIVEN .specrunner/logs/ に 3 個の *.log があり maxJobs=5 が設定されている
WHEN  pruneOldLogs(logsDir, 5) が実行される
THEN  どのファイルも削除されない
```

### T-032: 対応する jobId ディレクトリが存在しなくても削除処理が成功する

- **Priority**: should
- **Source**: Task 3.1（ENOENT は無視する）

```
GIVEN 削除対象の <jobId>.log に対応する <jobId>/ ディレクトリが存在しない
WHEN  pruneOldLogs() が実行される
THEN  ENOENT エラーを無視してスローせず処理が完了する
```

### T-033: pruneOldLogs のエラーが pipeline 実行を妨げない

- **Priority**: must
- **Source**: Task 3.3

```
GIVEN pruneOldLogs() 内で例外が発生する
WHEN  CommandRunner.execute() が pipeline を実行しようとする
THEN  エラーが logWarn で報告される
AND   pipeline 実行は継続される（abort しない）
```

### T-034: run 開始時に pruneOldLogs が呼ばれる

- **Priority**: must
- **Source**: Task 3.3, request 要件 3

```
GIVEN run コマンドが実行される
WHEN  CommandRunner.execute() が initPipelineLog() の直前に到達する
THEN  pruneOldLogs(logsDir, config.logs?.maxJobs ?? 20) が呼ばれる
```

---

## Category: Config — logs.maxJobs

### T-035: config.json の logs.maxJobs でデフォルト値が上書きされる

- **Priority**: must
- **Source**: AC-4, Task 3.2

```
GIVEN config.json に logs: { maxJobs: 5 } が設定されている
WHEN  retention チェックが実行される
THEN  maxJobs=5 で pruneOldLogs が呼ばれる
```

### T-036: logs.maxJobs 未設定時はデフォルト 20 が使用される

- **Priority**: must
- **Source**: AC-4, Task 3.2

```
GIVEN config.json に logs フィールドがない
WHEN  retention チェックが実行される
THEN  maxJobs=20 で pruneOldLogs が呼ばれる
```

### T-037: logs.maxJobs=0 で CONFIG_INVALID がスローされる

- **Priority**: must
- **Source**: Task 3.5

```
GIVEN config.json に logs: { maxJobs: 0 } が設定されている
WHEN  validateConfig() が呼ばれる
THEN  CONFIG_INVALID エラーがスローされる
```

### T-038: logs.maxJobs=-1 で CONFIG_INVALID がスローされる

- **Priority**: must
- **Source**: Task 3.5

```
GIVEN config.json に logs: { maxJobs: -1 } が設定されている
WHEN  validateConfig() が呼ばれる
THEN  CONFIG_INVALID エラーがスローされる
```

### T-039: logs.maxJobs=1001 で CONFIG_INVALID がスローされる

- **Priority**: must
- **Source**: Task 3.5

```
GIVEN config.json に logs: { maxJobs: 1001 } が設定されている
WHEN  validateConfig() が呼ばれる
THEN  CONFIG_INVALID エラーがスローされる
```

### T-040: logs.maxJobs が有効範囲（1-1000）で正常に設定される

- **Priority**: must
- **Source**: Task 3.5

```
GIVEN config.json に logs: { maxJobs: 1 } または { maxJobs: 1000 } が設定されている
WHEN  validateConfig() が呼ばれる
THEN  エラーなく設定が読み込まれる
```

---

## Category: finish / cancel での pipeline ログ

### T-041: finish コマンドで pipeline ログが初期化される

- **Priority**: must
- **Source**: D5, Task 4.2

```
GIVEN finish コマンドが実行され slug → jobId が解決される
WHEN  runFinish() が orchestrator を呼ぶ前
THEN  initPipelineLog(repoRoot, jobId) が呼ばれログファイルが作成される
```

### T-042: finish で開始・完了イベントが pipeline ログに記録される

- **Priority**: must
- **Source**: Task 4.4

```
GIVEN finish コマンドが実行される
WHEN  orchestrator 呼び出し前後で logPipelineEvent() が呼ばれる
THEN  開始イベントと完了イベントがログファイルに記録される
```

### T-043: finish でエラー時にエラーイベントが記録される

- **Priority**: must
- **Source**: Task 4.4

```
GIVEN finish コマンド実行中にエラーが発生する
WHEN  finally ブロックが実行される
THEN  エラーイベントが記録され closePipelineLog() が呼ばれる
```

### T-044: cancel コマンドで pipeline ログが初期化される

- **Priority**: must
- **Source**: D5, Task 4.3

```
GIVEN cancel コマンドが実行され jobId が解決される
WHEN  runCancel() が cancel 処理を実行する前
THEN  initPipelineLog(repoRoot, resolvedJobId) が呼ばれる
```

### T-045: cancel --all-terminated では job ごとのログ初期化をしない

- **Priority**: must
- **Source**: Task 4.3

```
GIVEN cancel --all-terminated が実行される
WHEN  bulk cancel 処理が実行される
THEN  個別 jobId に対する initPipelineLog() は呼ばれない
```

### T-046: doctor コマンドでは pipeline ログが初期化されない

- **Priority**: must
- **Source**: D5（doctor は pipeline ログ対象外）

```
GIVEN doctor コマンドが実行される
WHEN  環境診断処理が行われる
THEN  .specrunner/logs/ にログファイルが作成されない
```

---

## Category: job show — ログパス表示

### T-047: job show でログファイルが存在する場合に相対パスが表示される

- **Priority**: must
- **Source**: AC-6, Task 5.1

```
GIVEN specrunner job show <slug> を実行し <jobId>.log が存在する
WHEN  printJobState() が出力を生成する
THEN  出力に "Log:     .specrunner/logs/<jobId>.log" が含まれる（repoRoot 相対パス）
```

### T-048: job show でログファイルが存在しない場合に (none) が表示される

- **Priority**: must
- **Source**: Task 5.1

```
GIVEN specrunner job show <slug> を実行し <jobId>.log が存在しない
WHEN  printJobState() が出力を生成する
THEN  出力に "Log:     (none)" が含まれる
```

---

## Category: 型チェック・テスト品質ゲート

### T-049: bun run typecheck が green

- **Priority**: must
- **Source**: AC-7

```
GIVEN 全実装が完了した状態
WHEN  bun run typecheck を実行する
THEN  型エラーなく完了する
```

### T-050: bun run test が green

- **Priority**: must
- **Source**: AC-7

```
GIVEN 全実装と単体テストが揃った状態
WHEN  bun run test を実行する
THEN  全テストが pass する（PipelineLogger / SessionLogWriter / pruneOldLogs / config validation / job show）
```
