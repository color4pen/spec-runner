# Code Review — verbose-execution-log (iteration 2)

## Summary

iter 1 で指摘した F-01 (TC-05-01 / TC-05-02 のエラーハンドリング unit test) と F-02 (TC-10-01 〜 TC-10-03 / TC-09-02 の計装 unit test) は新規 3 ファイル (`verbose-log-errors.test.ts`, `executor-verbose-log.test.ts`, `claude-code/agent-runner-verbose-log.test.ts`) で適切に追加されている。implementation 本体は iter 1 から変更なく、設計通り (XDG_STATE_HOME / JSON Lines / ISO 8601 / append mode / maskSensitive 適用 / 全 exit path での `closeVerboseLog`) で完成度が高い。typecheck + 既存 2236 tests が green。Priority: must の test 不足は概ね解消したが、iter 1 で recommended 扱いだった F-03 (SSE/poll/managed session の must 計装テスト) は未着手で、TC-07-01/TC-07-02/TC-08-01/TC-09-01 が依然 unit test で検証されていない。

---

## Findings

### [MAJOR] F-01: SSE / poll / managed session 計装テスト未実装 (TC-07-01, TC-07-02, TC-08-01, TC-09-01 — Priority: must)

- **file**: `tests/unit/adapter/managed-agent/` (ディレクトリ全体に該当テストなし)
- **description**: `test-cases.md` で Priority: **must** に分類されている以下 4 件が iter 2 でも未実装。iter 1 の F-03 で「推奨」と扱われていたが、test-cases.md 上は must であり、`request.md` の受け入れ基準「log ファイルに event type 文字列が含まれる (= unit test)」「ポーリング回数 / 間隔 / レスポンス status がログに記録される (= unit test)」を直接満たす検証点である。

  | TC | 対象 | 期待内容 |
  |----|------|---------|
  | TC-07-01 | `runSseStream` で SSE `status_idle` event 受信 | ログに `"status_idle"` を含むエントリ |
  | TC-07-02 | `runSseStream` で SSE `session_error` event 受信 | エントリ component=`"sse"`, `errorType` フィールド |
  | TC-08-01 | `pollUntilComplete` の poll 試行 | ログに `"poll attempt"` + `intervalMs` + `sessionStatus` |
  | TC-09-01 | managed session 作成 (`ManagedAgentRunner.runDesignStyle` または `runPollingStyle`) | ログに `"session created"` + `runtime: "managed"` |

  実装側の計装は正しく入っており (`sse-stream.ts:73,102,129,138,154,159,170,176,184` / `completion.ts:97,109,128` / `agent-runner.ts:148,259,423,520`)、テストは mock client/stream を渡せば書ける純粋な unit test の範囲。実 SDK は要らない。
- **suggestion**:
  - `tests/unit/adapter/managed-agent/sse-stream-verbose-log.test.ts` を新規作成: mock の `streamEvents` を `async function*` で `session.status_idle` (end_turn) と `session.error` を yield し、`runSseStream` 呼び出し後にログファイルから `"status_idle"` / `"session_error event"` / `errorType` を assert する。
  - `tests/unit/adapter/managed-agent/completion-verbose-log.test.ts` を新規作成: `retrieveSession` を mock し最初は `running`、次に `idle` を返すように構成。`pollUntilComplete` 呼び出し後にログから `"poll attempt"` エントリと `intervalMs`/`sessionStatus` フィールドを assert。
  - `tests/unit/adapter/managed-agent/agent-runner-verbose-log.test.ts` を新規作成: `SessionClient.createSession` を mock し `ManagedAgentRunner.run({ step: designStep, ... })` を呼んだ後、ログに `"session created"` + `runtime: "managed"` を assert。

---

### [MINOR] F-02: 初回 SSE 接続失敗時のログ未記録 (iter 1 F-04 が未対応のまま)

- **file**: `src/adapter/managed-agent/sse-stream.ts` (line 71-79)
- **description**: `streamEvents()` が初回接続で throw した場合、SSE 接続成功時の `logVerbose("sse", "SSE stream connected", ...)` (line 73) と対称な「接続失敗」のログが残らない。デバッグ時に「verbose log を見ても SSE 試行の痕跡がない」状態になり、stuck 解析の本来目的に反する。stream 接続後の disconnect は line 184 で記録されているのと不整合。iter 1 F-04 で指摘済みだが未着手。
- **suggestion**:
  ```typescript
  } catch (err) {
    sseDisconnected = true;
    logVerbose("sse", "SSE stream connect failed", { sessionId, error: (err as Error).message });
    stderrWrite("SSE disconnected; falling back to polling.");
    deps.onSseDisconnected?.();
    return { ... };
  }
  ```

---

### [MINOR] F-03: managed agent resume fallback の session 作成がログ未記録 (iter 1 F-05 が未対応のまま)

- **file**: `src/adapter/managed-agent/agent-runner.ts` (line 383-390)
- **description**: resume 失敗時のフォールバック新規 session 作成パスに `logVerbose("session", "session created", ...)` が抜けている。`runDesignStyle` (line 148) と `runPollingStyle` の normal パス (line 423) は記録されているが、resume fallback 経路だけ無音。session 作成タイミングを全経路で記録する設計意図と不整合。iter 1 F-05 で指摘済みだが未着手。
- **suggestion**: line 390 直後（`sessionId = sessionResult.sessionId;`）に以下を追加:
  ```typescript
  logVerbose("session", "session created", { sessionId, stepName: step.name, runtime: "managed", fallback: true });
  ```

---

### [MINOR] F-04: `runner.ts` で `logVerbose` import が未使用

- **file**: `src/core/command/runner.ts` (line 23)
- **description**: `logVerbose` を import しているが本ファイル内では使用されていない (`logInfo`, `logError`, `initVerboseLog`, `closeVerboseLog`, `getVerboseLogFilePath` のみ使用)。`noUnusedLocals` が無効なので typecheck は通るがデッドコード。
- **suggestion**: import から `logVerbose` を削除する。または `execute()` 内で `logVerbose("pipeline", "pipeline started", { jobId })` / `logVerbose("pipeline", "pipeline completed", { exitCode })` の計装を追加する (design.md の component に `"pipeline"` が含まれているが現状どの計装ポイントからも emit されていない)。

---

### [NITS] F-05: TC-04-02 / TC-12-03 (resume integration) のテストなし

- **file**: `tests/` 全体 (resume + verbose のテストなし)
- **description**: test-cases.md TC-04-02「resume --verbose で同一 jobId のログファイルに追記される」と TC-12-03「`specrunner resume --verbose` で verbose 有効化」は must 扱いだが integration test 不在。ただし TC-VL-09 (2 回 init/close で append される) で append 動作はカバーされており、`resume.ts:15` の `setVerbose(resolveVerboseFlag(...))` も `run.ts` と完全に同じパターンで実装されている。実装の対称性で実質カバーと判断するなら追加不要。
- **suggestion**: 厳密にやるなら `tests/integration/resume-verbose.test.ts` を作って `runResumeCore` を実呼びし `XDG_STATE_HOME=tmpdir` 下でログが追記されることを検証。優先度低。

---

## Test Coverage

| test-cases.md scenario | covered by | status |
|---|---|---|
| TC-01-01 XDG_STATE_HOME 設定時 | `tests/unit/util/xdg.test.ts` TC-XDG-01 | ✅ |
| TC-01-02 XDG_STATE_HOME 未設定 | `tests/unit/util/xdg.test.ts` TC-XDG-02 | ✅ |
| TC-01-03 XDG_STATE_HOME 空文字 (should) | `xdg.test.ts` "returns ~/.local/state when empty string" | ✅ |
| TC-01-04 getVerboseLogDir | `xdg.test.ts` TC-XDG-03 | ✅ |
| TC-01-05 getVerboseLogPath | `xdg.test.ts` TC-XDG-04 | ✅ |
| TC-02-01 cliFlag=true | `verbose-log.test.ts` TC-VL-01 | ✅ |
| TC-02-02 env=verbose | `verbose-log.test.ts` TC-VL-02 | ✅ |
| TC-02-03 両方 false | `verbose-log.test.ts` TC-VL-03 | ✅ |
| TC-02-04 env=debug は無視 | `verbose-log.test.ts` TC-VL-04 | ✅ |
| TC-02-05 CLI が env より優先 (should) | `verbose-log.test.ts` TC-VL-01b | ✅ |
| TC-03-01 ディレクトリ自動作成 | `verbose-log.test.ts` TC-VL-05 が暗黙的に検証 | ✅ |
| TC-03-02 追記モード | `verbose-log.test.ts` TC-VL-09 | ✅ |
| TC-03-03 verbose=false で no-op | `verbose-log.test.ts` "initVerboseLog is no-op when verbose is false" | ✅ |
| TC-03-04 JSON Lines 形式 | `verbose-log.test.ts` TC-VL-05 | ✅ |
| TC-03-05 ts が ISO 8601 | `verbose-log.test.ts` TC-VL-07 | ✅ |
| TC-03-06 close 後 no-op | `verbose-log.test.ts` TC-VL-06 | ✅ |
| TC-03-07 close 多重呼び出し (should) | beforeEach/afterEach で実質検証 | ✅ |
| TC-03-08 maskSensitive 適用 | `verbose-log.test.ts` TC-VL-08 | ✅ |
| TC-03-09 getVerboseLogFilePath (should) | `verbose-log.test.ts` "returns log path when active" | ✅ |
| TC-03-10 close 後 null (should) | `verbose-log.test.ts` "returns null after closeVerboseLog" | ✅ |
| TC-04-01 同一 jobId 追記 | `verbose-log.test.ts` TC-VL-09 | ✅ |
| TC-04-02 resume で追記 | (integration test 未実装、F-05 参照) | ⚠️ |
| TC-05-01 ディレクトリ作成失敗 | `verbose-log-errors.test.ts` TC-05-01 | ✅ |
| TC-05-02 書き込み失敗 | `verbose-log-errors.test.ts` TC-05-02 | ✅ |
| TC-06-01 ログパス表示 (should) | (runner.ts 実装あり、test 未実装) | ⚠️ |
| TC-06-02 正常終了で close | `runner.ts` 全 exit path 静的に確認 | ⚠️ |
| TC-06-03 エラー終了で close | `runner.ts` catch ブロック静的に確認 | ⚠️ |
| TC-07-01 SSE status_idle | (未実装、F-01 参照) | ❌ |
| TC-07-02 SSE session_error | (未実装、F-01 参照) | ❌ |
| TC-07-03 SSE 接続・切断 (should) | (sse-stream.ts 実装あり、test 未実装) | ⚠️ |
| TC-08-01 poll attempt 記録 | (未実装、F-01 参照) | ❌ |
| TC-08-02 rescheduling (should) | (completion.ts 実装あり、test 未実装) | ⚠️ |
| TC-08-03 idle stopReason (should) | (completion.ts 実装あり、test 未実装) | ⚠️ |
| TC-09-01 managed session 作成 | (未実装、F-01 参照) | ❌ |
| TC-09-02 local query 開始 | `claude-code/agent-runner-verbose-log.test.ts` TC-09-02 | ✅ |
| TC-09-03 query timeout (should) | (claude-code/agent-runner.ts 実装あり、test 未実装) | ⚠️ |
| TC-10-01 step 開始 | `executor-verbose-log.test.ts` TC-10-01 | ✅ |
| TC-10-02 step 完了 | `executor-verbose-log.test.ts` TC-10-02 | ✅ |
| TC-10-03 step エラー | `executor-verbose-log.test.ts` TC-10-03 | ✅ |
| TC-10-04 verdict parsed (should) | (executor.ts 実装あり、test 未実装) | ⚠️ |
| TC-11-01 verbose 未指定で stderr 不変 | (既存 2236 test の regression で実質保証) | ✅ |
| TC-11-02 logInfo/Warn/Error 不変 | `stdout-verbose.test.ts` 既存 | ✅ |
| TC-11-03 verbose 有効でも重複なし (should) | 静的に保証 (logInfo は logFd を見ない) | ✅ |
| TC-12-01 `run --verbose` で log 生成 | (integration test 未実装) | ⚠️ |
| TC-12-02 env で log 生成 | (integration test 未実装) | ⚠️ |
| TC-12-03 `resume --verbose` で log 生成 | (integration test 未実装、F-05 参照) | ⚠️ |
| TC-13-01 typecheck green | verification-result.md iter 1 で確認済み | ✅ |
| TC-13-02 test green | verification-result.md iter 1 で確認済み | ✅ |
| TC-14-01 ADR 記録 | `specrunner/adr/2026-05-19-verbose-execution-log.md` | ✅ |

凡例: ✅ test 実装あり / ⚠️ 実装はあるが test 未実装 (should priority) / ❌ test 未実装 (must priority)

---

## Verdict

- **verdict**: needs-fix

needs-fix の根拠: must priority の TC-07-01 / TC-07-02 / TC-08-01 / TC-09-01 が依然 unit test 未実装で、`request.md` の受け入れ基準「log ファイルに event type 文字列が含まれる (= unit test)」「ポーリング回数 / 間隔 / レスポンス status がログに記録される (= unit test)」を直接満たすテストが不足している。これらは mock SessionClient + 既存 verbose log 機構の組み合わせで純粋な unit test として書ける範囲。F-02/F-03 (実装側の小さな抜け) と合わせて 1 iter で完了可能。
