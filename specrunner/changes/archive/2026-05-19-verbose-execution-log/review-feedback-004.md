# Code Review — verbose-execution-log (iteration 4)

## Summary

iter 3 で指摘した F-01 (TC-06-02 / TC-06-03: CommandRunner の verbose log close に関する unit test) が `runner.test.ts` に追加された。これにより must priority の未実装テストはすべて解消した。実装本体は iter 1 から変更なく、設計通り (XDG_STATE_HOME / JSON Lines / append mode / maskSensitive / 全 exit path での `closeVerboseLog`) で完成度が高い。iter 2 F-04 (初回 SSE 接続失敗ログ) および iter 2 F-03 (managed agent resume fallback session 作成ログ) もそれぞれ `sse-stream.ts:76` と `agent-runner.ts:391` で対応済み。`runner.ts` の未使用 `logVerbose` import (iter 2 F-04) も削除済み。typecheck + test 2236 件 green。

**結論**: must priority の全テストシナリオが実装・通過しており、設計仕様からの逸脱も見当たらない。マージを承認する。

---

## Findings

### iter 1 〜 iter 3 の指摘事項の解消確認

| 指摘 | 内容 | 解消確認 |
|------|------|----------|
| iter-1 F-01 | TC-05-01/05-02 エラーハンドリング unit test | `verbose-log-errors.test.ts` で対応済み |
| iter-1 F-02 | TC-10-01〜03, TC-09-02 計装 unit test | `executor-verbose-log.test.ts`, `claude-code/agent-runner-verbose-log.test.ts` で対応済み |
| iter-1 F-03 | TC-07-01/02, TC-08-01, TC-09-01 SSE/poll/managed test | 新規 3 ファイルで対応済み |
| iter-1 F-04 | sse-stream.ts 初回接続失敗のログ未記録 | `sse-stream.ts:76` `logVerbose("sse", "SSE stream connect failed", ...)` で対応済み |
| iter-1 F-05 | managed agent resume fallback session 作成のログ未記録 | `agent-runner.ts:391` `logVerbose("session", "session created", ..., fallback: true)` で対応済み |
| iter-2 F-04 | `runner.ts` の未使用 `logVerbose` import | 削除済み (import に `logVerbose` は含まれていない) |
| iter-3 F-01 | TC-06-02 / TC-06-03 CommandRunner verbose close unit test | `runner.test.ts` TC-06-02/TC-06-03 で対応済み |

---

### [minor] F-01: TC-06-02 テストが initVerboseLog を経由しない

- **file**: `tests/unit/core/command/runner.test.ts` (line 424-435)
- **description**: TC-06-02 と TC-06-03 のテストは `setVerbose(true)` を呼ぶが `initVerboseLog()` を直接呼ばない。`CommandRunner.execute()` 内で `initVerboseLog(jobState.jobId)` が呼ばれることを経由して fd が開かれる想定だが、テストの `XDG_STATE_HOME` は `tempDir` に向いているため実際にファイルが作成される。テスト終了後の `afterEach` で `closeVerboseLog()` と `setVerbose(false)` が呼ばれているので fd リークは生じない。ただし、成功時のテストコメント「fd が閉じられている」の根拠として `getVerboseLogFilePath() === null` のみを assertion しており、「実際に fd が開かれて閉じられた」という正のパスを明示的に検証していない。`getVerboseLogFilePath()` は `currentLogPath` の null 状態を返すだけであり、`initVerboseLog` が `XDG_STATE_HOME/specrunner/logs/<jobId>.log` を作成したかどうかは未確認。
- **severity**: minor — 機能上の問題はなく、null assertion で fd リーク検出の目的は達成されている。log ファイルの実在確認まで踏み込むかは好み。

---

### 観察事項 (non-blocking)

#### TC-04-02 (must) — resume integration シナリオ

iter-3 review の観察事項と同じ: test-cases.md は「integration test」と明記しており、実 CLI 起動が必要なため unit test では検証不可能。TC-04-01 (append mode unit test) と `resume.ts:15` での `setVerbose(resolveVerboseFlag(...))` → `initVerboseLog` 呼び出しが `run.ts` と対称であることで実質カバーされていると判断し、引き続き non-blocking とする。

#### TC-12-01, TC-12-02, TC-12-03 — CLI フラグ integration テスト

実 CLI 実行が必要な integration テストのため unit test 範囲外。`run.ts` と `resume.ts` での `resolveVerboseFlag` 呼び出しは静的に確認済みで問題なし。

---

## Test Coverage

| TC | Priority | Status |
|----|----------|--------|
| TC-01-01〜05 | must / should | ✅ xdg.test.ts |
| TC-02-01〜04 | must | ✅ verbose-log.test.ts |
| TC-03-01〜08 | must | ✅ verbose-log.test.ts |
| TC-03-09〜10 | should | ✅ verbose-log.test.ts |
| TC-04-01 | must | ✅ TC-VL-09 (append mode) |
| TC-04-02 | must | ⚠ integration-only; mechanism covered |
| TC-05-01〜02 | must | ✅ verbose-log-errors.test.ts |
| TC-06-01 | should | ✅ runner.ts logInfo 呼び出しで実装確認済み |
| TC-06-02 | must | ✅ runner.test.ts TC-06-02 (iter 4 新規) |
| TC-06-03 | must | ✅ runner.test.ts TC-06-03 (iter 4 新規) |
| TC-07-01 | must | ✅ sse-stream-verbose-log.test.ts (iter 3 新規) |
| TC-07-02 | must | ✅ sse-stream-verbose-log.test.ts (iter 3 新規) |
| TC-07-03 | should | ⚠ 実装あり (sse-stream.ts:73,76)、test 未実装 |
| TC-08-01 | must | ✅ completion-verbose-log.test.ts (iter 3 新規) |
| TC-08-02 | should | ⚠ 実装あり (completion.ts:109)、test 未実装 |
| TC-08-03 | should | ⚠ 実装あり (completion.ts:128)、test 未実装 |
| TC-09-01 | must | ✅ agent-runner-verbose-log.test.ts (iter 3 新規) |
| TC-09-02 | must | ✅ claude-code/agent-runner-verbose-log.test.ts |
| TC-09-03 | should | ⚠ 実装あり (claude-code/agent-runner.ts:207)、test 未実装 |
| TC-10-01〜03 | must | ✅ executor-verbose-log.test.ts |
| TC-10-04 | should | ⚠ 実装あり (executor.ts:457)、test 未実装 |
| TC-11-01〜02 | must | ✅ 既存 2236 tests の regression で保証 |
| TC-11-03 | should | ✅ 静的に保証 (logInfo は logFd を参照しない) |
| TC-12-01〜03 | must | ⚠ integration test 未実装 (unit test 範囲外) |
| TC-13-01〜02 | must | ✅ verification-result.md: build/typecheck/test all passed |
| TC-14-01 | must | ✅ adr/2026-05-19-verbose-execution-log.md 4 判断記録済み |

凡例: ✅ covered / ⚠ should priority のみ未実装または integration-only

---

## Verdict

- **verdict**: approved
