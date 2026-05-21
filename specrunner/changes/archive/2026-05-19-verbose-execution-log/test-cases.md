# Test Cases: verbose-execution-log

Source tasks: T-01 〜 T-11  
Format: GIVEN / WHEN / THEN

---

## Category: XDG State Dir ヘルパー (T-01)

### TC-01-01 — XDG_STATE_HOME 環境変数が設定されている場合
- **Priority**: must
- **Source**: T-01 / 受け入れ基準「XDG_STATE_HOME 準拠」

**GIVEN** `XDG_STATE_HOME=/custom/state` が設定されている  
**WHEN** `resolveXdgStateDir()` を呼ぶ  
**THEN** `/custom/state` を返す

---

### TC-01-02 — XDG_STATE_HOME 未設定のデフォルトパス
- **Priority**: must
- **Source**: T-01 / XDG spec デフォルト

**GIVEN** `XDG_STATE_HOME` が未設定  
**WHEN** `resolveXdgStateDir()` を呼ぶ  
**THEN** `~/.local/state`（= `os.homedir()/.local/state`）を返す

---

### TC-01-03 — XDG_STATE_HOME が空文字の場合はデフォルトにフォールバック
- **Priority**: should
- **Source**: T-01 / `xdg.ts` の既存パターン（`length > 0` チェック）

**GIVEN** `XDG_STATE_HOME=""` が設定されている  
**WHEN** `resolveXdgStateDir()` を呼ぶ  
**THEN** `~/.local/state` を返す（空文字は無視）

---

### TC-01-04 — getVerboseLogDir のパス構造
- **Priority**: must
- **Source**: T-01 / 要件2「配置: `~/.local/state/specrunner/logs/`」

**GIVEN** `XDG_STATE_HOME=/test/state` が設定されている  
**WHEN** `getVerboseLogDir()` を呼ぶ  
**THEN** `/test/state/specrunner/logs` を返す

---

### TC-01-05 — getVerboseLogPath の jobId 組み込み
- **Priority**: must
- **Source**: T-01 / 要件2「jobId ごとに 1 ファイル」

**GIVEN** `XDG_STATE_HOME=/test/state` が設定されている  
**WHEN** `getVerboseLogPath("job-abc123")` を呼ぶ  
**THEN** `/test/state/specrunner/logs/job-abc123.log` を返す

---

## Category: resolveVerboseFlag (T-02 / T-09-b)

### TC-02-01 — CLI フラグ true で verbose ON
- **Priority**: must
- **Source**: T-09-b / 要件1「`--verbose` フラグ」

**GIVEN** `SPECRUNNER_LOG_LEVEL` が未設定  
**WHEN** `resolveVerboseFlag(true)` を呼ぶ  
**THEN** `true` を返す

---

### TC-02-02 — 環境変数 `verbose` で verbose ON
- **Priority**: must
- **Source**: T-09-b / 要件1「`SPECRUNNER_LOG_LEVEL=verbose`」

**GIVEN** `SPECRUNNER_LOG_LEVEL=verbose` が設定されている  
**WHEN** `resolveVerboseFlag(false)` を呼ぶ  
**THEN** `true` を返す

---

### TC-02-03 — CLI フラグも環境変数も未指定で verbose OFF
- **Priority**: must
- **Source**: T-09-b / 要件1「未指定時は現状通り」

**GIVEN** `SPECRUNNER_LOG_LEVEL` が未設定  
**WHEN** `resolveVerboseFlag(false)` を呼ぶ  
**THEN** `false` を返す

---

### TC-02-04 — 環境変数が "verbose" 以外の値は無視
- **Priority**: must
- **Source**: T-09-b / 「"verbose" 以外は無視」

**GIVEN** `SPECRUNNER_LOG_LEVEL=debug` が設定されている  
**WHEN** `resolveVerboseFlag(false)` を呼ぶ  
**THEN** `false` を返す

---

### TC-02-05 — CLI フラグが env var より優先
- **Priority**: should
- **Source**: T-02-c / 「CLI flag || env var」

**GIVEN** `SPECRUNNER_LOG_LEVEL` が未設定  
**WHEN** `resolveVerboseFlag(true)` を呼ぶ  
**THEN** `true` を返す（env var 無関係に true）

---

## Category: initVerboseLog / logVerbose / closeVerboseLog (T-02 / T-09-c, d)

### TC-03-01 — ログディレクトリの自動作成
- **Priority**: must
- **Source**: T-09-c / 受け入れ基準「ディレクトリは初回書き込み時に自動作成」

**GIVEN** `setVerbose(true)` が呼ばれ、ログディレクトリが存在しない  
**WHEN** `initVerboseLog("job-001")` を呼ぶ  
**THEN** `$XDG_STATE_HOME/specrunner/logs/` ディレクトリが作成される

---

### TC-03-02 — initVerboseLog でファイルが追記モードで開かれる
- **Priority**: must
- **Source**: T-09-c / 要件2「ファイルは追記モード」

**GIVEN** `setVerbose(true)` が呼ばれ、既に同 jobId のログファイルが存在する  
**WHEN** `initVerboseLog("job-001")` を呼ぶ  
**THEN** 既存ファイルは切り詰められず、追記モード (`"a"`) でオープンされる

---

### TC-03-03 — verbose 無効時は initVerboseLog が no-op
- **Priority**: must
- **Source**: T-02-d / 受け入れ基準「verbose 未指定時は log ファイル生成されず」

**GIVEN** `setVerbose(false)` が呼ばれている  
**WHEN** `initVerboseLog("job-001")` を呼ぶ  
**THEN** ログファイルが作成されない

---

### TC-03-04 — logVerbose が JSON Lines 形式でファイルに書き込む
- **Priority**: must
- **Source**: T-09-c / ADR「ログ形式: JSON Lines」

**GIVEN** `setVerbose(true)` + `initVerboseLog("job-001")` が呼ばれた後  
**WHEN** `logVerbose("step", "step started", { step: "propose" })` を呼ぶ  
**THEN** ログファイルの末尾に 1 行の JSON オブジェクトが書き出され、`ts` / `component` / `message` キーを含む

---

### TC-03-05 — logVerbose のエントリに ts フィールドが ISO 8601 形式
- **Priority**: must
- **Source**: T-09-c / ADR「タイムスタンプ: ISO 8601 ミリ秒」

**GIVEN** `initVerboseLog("job-001")` が呼ばれた後  
**WHEN** `logVerbose("step", "step started")` を呼ぶ  
**THEN** エントリの `ts` フィールドが ISO 8601 ミリ秒形式（例: `"2026-05-19T10:30:00.123Z"`）

---

### TC-03-06 — closeVerboseLog 後の logVerbose は何も書かない
- **Priority**: must
- **Source**: T-09-c / 受け入れ基準「closeVerboseLog 後は no-op」

**GIVEN** `initVerboseLog("job-001")` → `closeVerboseLog()` が呼ばれた後  
**WHEN** `logVerbose("step", "after close")` を呼ぶ  
**THEN** ログファイルにエントリが追加されない（例外も発生しない）

---

### TC-03-07 — closeVerboseLog は複数回呼んでもエラーにならない
- **Priority**: should
- **Source**: T-02-f / 「Safe to call multiple times」

**GIVEN** `initVerboseLog("job-001")` → `closeVerboseLog()` が呼ばれた後  
**WHEN** `closeVerboseLog()` をもう一度呼ぶ  
**THEN** 例外が発生しない

---

### TC-03-08 — logVerbose で API キーがマスクされる
- **Priority**: must
- **Source**: T-02-e / 「maskSensitive を適用して token 漏洩を防止」

**GIVEN** `initVerboseLog("job-001")` が呼ばれた後  
**WHEN** `logVerbose("session", "query started", { apiKey: "sk-ant-abc123" })` を呼ぶ  
**THEN** ログファイルの該当エントリに API key が平文で含まれない（マスク済み）

---

### TC-03-09 — getVerboseLogFilePath が初期化後にパスを返す
- **Priority**: should
- **Source**: T-02-g / 「ログパスをユーザーに表示するため」

**GIVEN** `setVerbose(true)` + `initVerboseLog("job-001")` が呼ばれた後  
**WHEN** `getVerboseLogFilePath()` を呼ぶ  
**THEN** `$XDG_STATE_HOME/specrunner/logs/job-001.log` のパスを返す

---

### TC-03-10 — getVerboseLogFilePath が closeVerboseLog 後に null を返す
- **Priority**: should
- **Source**: T-02-g / closeVerboseLog で `currentLogPath = null`

**GIVEN** `initVerboseLog("job-001")` → `closeVerboseLog()` が呼ばれた後  
**WHEN** `getVerboseLogFilePath()` を呼ぶ  
**THEN** `null` を返す

---

## Category: ログ追記（retry / resume シミュレーション）(T-09-d)

### TC-04-01 — 同一 jobId で 2 回 init/close すると 1 ファイルに追記される
- **Priority**: must
- **Source**: T-09-d / 受け入れ基準「同一 jobId の retry / resume で 1 ファイルに集約」

**GIVEN** `setVerbose(true)` が有効  
**WHEN** `initVerboseLog("job-001")` → `logVerbose("step", "first run")` → `closeVerboseLog()` の後、再度 `initVerboseLog("job-001")` → `logVerbose("step", "second run")` → `closeVerboseLog()` を実行する  
**THEN** `job-001.log` に 2 行のエントリが含まれ、1 行目と 2 行目は別々のエントリである

---

### TC-04-02 — resume --verbose で同一 jobId のログファイルに追記される
- **Priority**: must
- **Source**: 要件6 / 受け入れ基準「resume --verbose でも同一 jobId のログファイルに追記」

**GIVEN** `specrunner run --verbose <slug>` で `job-001.log` にエントリが書き込まれた後  
**WHEN** `specrunner resume --verbose <slug>` を実行する（同一 jobId を使用）  
**THEN** `job-001.log` に resume 後のエントリが追記され、ファイルが上書きされていない

---

## Category: エラーハンドリング (T-02 / design.md Error Handling)

### TC-05-01 — ログディレクトリ作成失敗時は stderr 警告を出してパイプライン継続
- **Priority**: must
- **Source**: design.md「Error Handling」/ 「パイプラインをブロックしない」

**GIVEN** `setVerbose(true)` が有効で、ログディレクトリのパーミッションが書き込み不可  
**WHEN** `initVerboseLog("job-001")` を呼ぶ  
**THEN** stderr に警告メッセージが出力される AND `logFd` が null のまま AND 例外が呼び出し元に伝播しない

---

### TC-05-02 — logVerbose 書き込み失敗時は以降の書き込みを停止してパイプライン継続
- **Priority**: must
- **Source**: design.md「Error Handling」/ 「logFd = null にして以降の書き込みを停止」

**GIVEN** `initVerboseLog("job-001")` が呼ばれた後、fd が閉じられた状態  
**WHEN** `logVerbose("step", "test")` を呼ぶ  
**THEN** 例外が発生しない AND `logFd` が null になる AND 以降の `logVerbose` 呼び出しも no-op になる

---

## Category: CommandRunner ライフサイクル (T-04)

### TC-06-01 — verbose ON 時に pipeline 終了後にログパスが表示される
- **Priority**: should
- **Source**: T-04-d / 「verbose 有効時にログパスを表示」

**GIVEN** `specrunner run --verbose <slug>` を実行した後  
**WHEN** pipeline が正常終了する  
**THEN** 標準出力または info ログに `Verbose log: ~/.local/state/specrunner/logs/<jobId>.log` が表示される

---

### TC-06-02 — pipeline 正常終了時に closeVerboseLog が呼ばれる
- **Priority**: must
- **Source**: T-04-c / 「全 exit path で closeVerboseLog」

**GIVEN** `setVerbose(true)` で `initVerboseLog` が呼ばれた後  
**WHEN** pipeline が正常終了する  
**THEN** `getVerboseLogFilePath()` が `null` を返す（= fd が閉じられている）

---

### TC-06-03 — pipeline エラー終了時も closeVerboseLog が呼ばれる
- **Priority**: must
- **Source**: T-04-c / 「全 exit path（success / error / throw）で」

**GIVEN** `setVerbose(true)` で `initVerboseLog` が呼ばれた後  
**WHEN** pipeline が例外で終了する  
**THEN** `getVerboseLogFilePath()` が `null` を返す（= fd がリークしていない）

---

## Category: SSE イベント計装 (T-05)

### TC-07-01 — SSE status_idle イベントがログに記録される
- **Priority**: must
- **Source**: T-05-b / 受け入れ基準「event type 文字列が含まれる」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれ、managed runtime を使用  
**WHEN** SSE ストリームで `session.status_idle` イベントを受信する  
**THEN** ログファイルに `"status_idle"` を含む JSON Lines エントリが書き出される

---

### TC-07-02 — SSE session_error イベントが errorType 付きで記録される
- **Priority**: must
- **Source**: T-05-b / 要件3「SSE event 種別と payload」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれた後  
**WHEN** SSE ストリームで `session.error` イベントを受信する  
**THEN** ログエントリの `component` が `"sse"` で `errorType` フィールドが含まれる

---

### TC-07-03 — SSE 接続・切断タイミングが記録される
- **Priority**: should
- **Source**: T-05-c / 「SSE 接続時と切断時」

**GIVEN** `setVerbose(true)` が有効  
**WHEN** SSE ストリームへの接続成功後、および切断時  
**THEN** `"SSE stream connected"` および `"SSE stream disconnected"` を含むエントリが記録される

---

## Category: ポーリング計装 (T-06)

### TC-08-01 — poll attempt がポーリング試行ごとに記録される
- **Priority**: must
- **Source**: T-09-e / 受け入れ基準「ポーリング回数 / 間隔 / セッション status がログに記録される」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれ、managed runtime を使用  
**WHEN** `pollUntilComplete` がポーリングを実行する  
**THEN** ログファイルに `"poll attempt"` を含む JSON Lines エントリが書き出され、`intervalMs` / `sessionStatus` フィールドを含む

---

### TC-08-02 — rescheduling 検出時に専用エントリが記録される
- **Priority**: should
- **Source**: T-06-b / 「rescheduling 検出時」

**GIVEN** `setVerbose(true)` が有効で managed runtime がセッションを reschedule する  
**WHEN** `pollUntilComplete` が `rescheduling` ステータスを検出する  
**THEN** `"session rescheduling"` を含むエントリに `reschedulingCount` フィールドが記録される

---

### TC-08-03 — idle 検出時に stopReason 付きエントリが記録される
- **Priority**: should
- **Source**: T-06-b / 「idle 検出時」

**GIVEN** `setVerbose(true)` が有効  
**WHEN** `pollUntilComplete` がセッションの idle 状態を検出する  
**THEN** `"session idle detected"` を含むエントリに `stopReason` フィールドが記録される

---

## Category: セッションライフサイクル計装 (T-07)

### TC-09-01 — managed runtime でセッション作成が記録される
- **Priority**: must
- **Source**: T-07-a / 要件3「セッション作成・削除のタイミング」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれ、managed runtime を使用  
**WHEN** セッションが作成される  
**THEN** ログに `"session created"` かつ `runtime: "managed"` を含むエントリが書き出される

---

### TC-09-02 — local runtime (claude-code) で query 開始が記録される
- **Priority**: must
- **Source**: T-07-b / 要件3「managed runtime / local runtime いずれも」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれ、local (claude-code) runtime を使用  
**WHEN** `runQuery()` が開始される  
**THEN** ログに `"query started"` かつ `runtime: "local"` を含むエントリが書き出される

---

### TC-09-03 — local runtime でタイムアウト発生が記録される
- **Priority**: should
- **Source**: T-07-b / 「タイムアウト時: query timeout」

**GIVEN** `setVerbose(true)` が有効で local runtime がタイムアウトする  
**WHEN** query がタイムアウトする  
**THEN** ログに `"query timeout"` かつ `timeoutMs` フィールドを含むエントリが記録される

---

## Category: Step 遷移計装 (T-08)

### TC-10-01 — step 開始タイムスタンプが記録される
- **Priority**: must
- **Source**: T-08-a / 受け入れ基準「step_transition」/ 要件3「step 遷移のタイムスタンプ」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれた後  
**WHEN** step executor が step を開始する  
**THEN** ログに `"step started"` かつ `step` フィールドを含む JSON Lines エントリが書き出される

---

### TC-10-02 — step 完了が記録される
- **Priority**: must
- **Source**: T-08-a / 受け入れ基準「step_transition」

**GIVEN** `setVerbose(true)` + `initVerboseLog` が呼ばれた後  
**WHEN** step executor が step を正常完了する  
**THEN** ログに `"step completed"` を含むエントリが書き出される

---

### TC-10-03 — step エラーが error メッセージ付きで記録される
- **Priority**: must
- **Source**: T-08-a / 「step error」

**GIVEN** `setVerbose(true)` が有効  
**WHEN** step executor が step 内でエラーを捕捉する  
**THEN** ログに `"step error"` かつ `error` フィールドを含むエントリが記録される

---

### TC-10-04 — verdict が記録される
- **Priority**: should
- **Source**: T-08-b / 「verdict parsed」

**GIVEN** `setVerbose(true)` が有効  
**WHEN** `finalizeStep` が verdict を確定する  
**THEN** ログに `"verdict parsed"` かつ `verdict` フィールドを含むエントリが記録される

---

## Category: 後方互換性 (backward compatibility)

### TC-11-01 — verbose 未指定時に既存 stderr 出力が変化しない
- **Priority**: must
- **Source**: 要件1「未指定時は現状通り最低限の stderr 出力のみ」/ design.md「既存の stderr 出力は一切変更しない」

**GIVEN** `--verbose` フラグも `SPECRUNNER_LOG_LEVEL` も指定しない  
**WHEN** `specrunner run <slug>` を実行する  
**THEN** stderr に `[<step>] running...` / `[<step>] ✓ (Xs)` の既存出力が表示される AND ログファイルが作成されない

---

### TC-11-02 — verbose 未指定時に logInfo / logWarn / logError の挙動が変化しない
- **Priority**: must
- **Source**: T-02 / 「既存の stderrWrite / info / warn / error 関数の振る舞いは変更しない」

**GIVEN** verbose が無効  
**WHEN** `logInfo()` / `logWarn()` / `logError()` を呼ぶ  
**THEN** それぞれ従来通り stderr に出力される

---

### TC-11-03 — verbose 有効時でも logInfo / logWarn / logError が重複出力しない
- **Priority**: should
- **Source**: T-02 / 「既存 stderr 出力は一切変更しない」

**GIVEN** `setVerbose(true)` が有効  
**WHEN** `logInfo("some message")` を呼ぶ  
**THEN** stderr に 1 回だけ出力される AND ログファイルへの書き込みは行われない

---

## Category: CLI フラグ統合 (T-03)

### TC-12-01 — `specrunner run --verbose` で verbose が有効になる
- **Priority**: must
- **Source**: T-03-a / 受け入れ基準「`specrunner run --verbose <slug>` でログが書き出される」

**GIVEN** `specrunner run --verbose <slug>` を実行する  
**WHEN** pipeline が起動する  
**THEN** `~/.local/state/specrunner/logs/<jobId>.log` が作成される

---

### TC-12-02 — `SPECRUNNER_LOG_LEVEL=verbose` で verbose が有効になる
- **Priority**: must
- **Source**: T-03-a / 受け入れ基準「環境変数でも同じ動作」

**GIVEN** `SPECRUNNER_LOG_LEVEL=verbose` が設定されている  
**WHEN** `specrunner run <slug>`（`--verbose` なし）を実行する  
**THEN** `~/.local/state/specrunner/logs/<jobId>.log` が作成される

---

### TC-12-03 — `specrunner resume --verbose` で verbose が有効になる
- **Priority**: must
- **Source**: T-03-b / 要件6「resume コマンドも `--verbose` 対応」

**GIVEN** `specrunner resume --verbose <slug>` を実行する  
**WHEN** resume pipeline が起動する  
**THEN** `~/.local/state/specrunner/logs/<jobId>.log` に追記される

---

## Category: 型チェックとビルド (T-11)

### TC-13-01 — typecheck が green
- **Priority**: must
- **Source**: T-11 / 受け入れ基準「bun run typecheck が green」

**GIVEN** 全変更が実装済み  
**WHEN** `bun run typecheck` を実行する  
**THEN** 型エラーが 0 件

---

### TC-13-02 — テストが green
- **Priority**: must
- **Source**: T-11 / 受け入れ基準「bun run test が green」

**GIVEN** 全変更が実装済み  
**WHEN** `bun run test` を実行する  
**THEN** 全テストが pass

---

## Category: ADR (T-10)

### TC-14-01 — ADR ファイルが存在し必須の判断が記録されている
- **Priority**: must
- **Source**: T-10 / 受け入れ基準「ADR に判断が記録されている」

**GIVEN** 実装が完了している  
**WHEN** `specrunner/adr/2026-05-19-verbose-execution-log.md` を確認する  
**THEN** 以下の 4 判断が記録されている: (1) ログ形式 JSON Lines (2) タイムスタンプ ISO 8601 (3) ログ出力先 XDG_STATE_HOME (4) 設定経路 module-level global state
